DROP FUNCTION public.submit_donation(text, text, numeric, text, integer, integer, integer, boolean, boolean, text, text);
DROP FUNCTION public.get_donation_leaderboard(integer, text);
DROP FUNCTION public.get_donation_summary(integer, text);
DROP FUNCTION public.get_donator_player_keys(text[]);

CREATE SCHEMA donations_internal;
REVOKE ALL ON SCHEMA donations_internal FROM PUBLIC;
GRANT USAGE ON SCHEMA donations_internal TO anon, authenticated, service_role;

CREATE VIEW donations_internal.leaderboard AS
WITH verified AS (
  SELECT d.* FROM public.donations d WHERE d.status = 'verified'
), ranked AS (
  SELECT v.*,
    CASE WHEN NOT v.hide_amount THEN
      row_number() OVER (PARTITION BY v.currency, v.season_id ORDER BY v.amount DESC, v.donated_at ASC, v.id ASC)
    END AS seasonal_rank,
    CASE WHEN NOT v.hide_amount THEN
      row_number() OVER (PARTITION BY v.currency ORDER BY v.amount DESC, v.donated_at ASC, v.id ASC)
    END AS all_time_rank
  FROM verified v
)
SELECT
  r.id AS donation_id,
  CASE WHEN r.hide_name THEN 'Anonymous Donor' ELSE r.donor_name END AS display_name,
  CASE WHEN r.hide_name THEN NULL ELSE r.player_key END AS player_key,
  CASE WHEN r.hide_amount THEN NULL ELSE r.amount END AS amount,
  r.currency,
  r.tournament_pct,
  r.maintenance_pct,
  r.developer_pct,
  r.donated_at,
  r.season_id,
  r.seasonal_rank::integer AS seasonal_rank,
  r.all_time_rank::integer AS all_time_rank,
  r.hide_amount AS amount_hidden
FROM ranked r;

CREATE VIEW donations_internal.summaries AS
WITH verified AS (
  SELECT d.* FROM public.donations d WHERE d.status = 'verified'
), all_time AS (
  SELECT
    v.currency,
    NULL::integer AS season_id,
    sum(v.amount) AS total_amount,
    round(sum(v.amount * v.tournament_pct / 100.0), 2) AS tournament_total,
    round(sum(v.amount * v.maintenance_pct / 100.0), 2) AS maintenance_total,
    round(sum(v.amount * v.developer_pct / 100.0), 2) AS developer_total,
    count(DISTINCT COALESCE(v.user_id::text, v.player_key, lower(v.donor_name)))::integer AS supporter_count,
    count(*)::integer AS donation_count,
    round(sum(CASE WHEN v.donated_at >= date_trunc('month', now()) AND v.donated_at < date_trunc('month', now()) + interval '1 month' THEN v.amount * v.maintenance_pct / 100.0 ELSE 0 END), 2) AS monthly_maintenance
  FROM verified v GROUP BY v.currency
), seasonal AS (
  SELECT
    v.currency,
    v.season_id,
    sum(v.amount) AS total_amount,
    round(sum(v.amount * v.tournament_pct / 100.0), 2) AS tournament_total,
    round(sum(v.amount * v.maintenance_pct / 100.0), 2) AS maintenance_total,
    round(sum(v.amount * v.developer_pct / 100.0), 2) AS developer_total,
    count(DISTINCT COALESCE(v.user_id::text, v.player_key, lower(v.donor_name)))::integer AS supporter_count,
    count(*)::integer AS donation_count,
    round(sum(CASE WHEN v.donated_at >= date_trunc('month', now()) AND v.donated_at < date_trunc('month', now()) + interval '1 month' THEN v.amount * v.maintenance_pct / 100.0 ELSE 0 END), 2) AS monthly_maintenance
  FROM verified v GROUP BY v.currency, v.season_id
)
SELECT * FROM all_time
UNION ALL
SELECT * FROM seasonal;

CREATE VIEW donations_internal.donator_player_keys AS
SELECT DISTINCT d.player_key
FROM public.donations d
WHERE d.status = 'verified' AND d.hide_name = false AND d.player_key IS NOT NULL;

REVOKE ALL ON donations_internal.leaderboard FROM PUBLIC;
REVOKE ALL ON donations_internal.summaries FROM PUBLIC;
REVOKE ALL ON donations_internal.donator_player_keys FROM PUBLIC;
GRANT SELECT ON donations_internal.leaderboard TO anon, authenticated, service_role;
GRANT SELECT ON donations_internal.summaries TO anon, authenticated, service_role;
GRANT SELECT ON donations_internal.donator_player_keys TO anon, authenticated, service_role;

GRANT INSERT ON public.donations TO anon, authenticated;
CREATE POLICY "Anyone can submit a pending donation"
ON public.donations FOR INSERT TO anon, authenticated
WITH CHECK (
  status = 'pending'
  AND verified_by IS NULL
  AND verified_at IS NULL
  AND ((auth.uid() IS NULL AND user_id IS NULL) OR auth.uid() = user_id)
);

CREATE FUNCTION public.submit_donation(
  p_donor_name text,
  p_player_key text,
  p_amount numeric,
  p_currency text,
  p_tournament_pct integer,
  p_maintenance_pct integer,
  p_developer_pct integer,
  p_hide_name boolean,
  p_hide_amount boolean,
  p_payment_method text,
  p_donor_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_season_id integer;
  v_name text := trim(p_donor_name);
  v_note text := nullif(trim(p_donor_note), '');
BEGIN
  IF char_length(v_name) < 2 OR char_length(v_name) > 80 THEN
    RAISE EXCEPTION 'Please enter a donor name between 2 and 80 characters';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 1000000 THEN
    RAISE EXCEPTION 'Please enter a valid donation amount';
  END IF;
  IF p_currency NOT IN ('USD', 'EUR', 'GBP') THEN
    RAISE EXCEPTION 'Unsupported currency';
  END IF;
  IF p_tournament_pct < 0 OR p_maintenance_pct < 0 OR p_developer_pct < 0
     OR p_tournament_pct > 100 OR p_maintenance_pct > 100 OR p_developer_pct > 100
     OR p_tournament_pct + p_maintenance_pct + p_developer_pct <> 100 THEN
    RAISE EXCEPTION 'Allocation percentages must add up to 100';
  END IF;
  IF p_payment_method NOT IN ('paypal', 'revolut', 'steam', 'gift_card', 'other') THEN
    RAISE EXCEPTION 'Unsupported payment method';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'Payment note is too long';
  END IF;
  IF p_player_key IS NOT NULL AND char_length(p_player_key) > 100 THEN
    RAISE EXCEPTION 'Player name is too long';
  END IF;

  SELECT s.id INTO v_season_id
  FROM public.sp_seasons s
  WHERE now() >= s.starts_at AND now() < s.ends_at
  ORDER BY s.id DESC
  LIMIT 1;

  INSERT INTO public.donations (
    donor_name, player_key, user_id, amount, currency,
    tournament_pct, maintenance_pct, developer_pct,
    hide_name, hide_amount, payment_method, donor_note,
    status, season_id, donated_at
  ) VALUES (
    v_name, nullif(lower(trim(p_player_key)), ''), auth.uid(), round(p_amount, 2), p_currency,
    p_tournament_pct, p_maintenance_pct, p_developer_pct,
    p_hide_name, p_hide_amount, p_payment_method, v_note,
    'pending', v_season_id, now()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE FUNCTION public.get_donation_leaderboard(
  p_season_id integer DEFAULT NULL,
  p_currency text DEFAULT 'USD'
)
RETURNS TABLE (
  donation_id uuid,
  display_name text,
  player_key text,
  amount numeric,
  currency text,
  tournament_pct integer,
  maintenance_pct integer,
  developer_pct integer,
  donated_at timestamp with time zone,
  donor_rank integer,
  amount_hidden boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT * FROM (
    SELECT
      l.donation_id, l.display_name, l.player_key, l.amount, l.currency,
      l.tournament_pct, l.maintenance_pct, l.developer_pct, l.donated_at,
      CASE WHEN p_season_id IS NULL THEN l.all_time_rank ELSE l.seasonal_rank END AS donor_rank,
      l.amount_hidden
    FROM donations_internal.leaderboard l
    WHERE l.currency = p_currency
      AND (p_season_id IS NULL OR l.season_id = p_season_id)
  ) board
  ORDER BY board.amount_hidden ASC, board.donor_rank ASC NULLS LAST, board.donated_at DESC
  LIMIT 200;
$$;

CREATE FUNCTION public.get_donation_summary(
  p_season_id integer DEFAULT NULL,
  p_currency text DEFAULT 'USD'
)
RETURNS TABLE (
  total_amount numeric,
  tournament_total numeric,
  maintenance_total numeric,
  developer_total numeric,
  supporter_count integer,
  donation_count integer,
  monthly_maintenance numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    COALESCE((SELECT s.total_amount FROM donations_internal.summaries s WHERE s.currency = p_currency AND ((p_season_id IS NULL AND s.season_id IS NULL) OR s.season_id = p_season_id)), 0),
    COALESCE((SELECT s.tournament_total FROM donations_internal.summaries s WHERE s.currency = p_currency AND ((p_season_id IS NULL AND s.season_id IS NULL) OR s.season_id = p_season_id)), 0),
    COALESCE((SELECT s.maintenance_total FROM donations_internal.summaries s WHERE s.currency = p_currency AND ((p_season_id IS NULL AND s.season_id IS NULL) OR s.season_id = p_season_id)), 0),
    COALESCE((SELECT s.developer_total FROM donations_internal.summaries s WHERE s.currency = p_currency AND ((p_season_id IS NULL AND s.season_id IS NULL) OR s.season_id = p_season_id)), 0),
    COALESCE((SELECT s.supporter_count FROM donations_internal.summaries s WHERE s.currency = p_currency AND ((p_season_id IS NULL AND s.season_id IS NULL) OR s.season_id = p_season_id)), 0),
    COALESCE((SELECT s.donation_count FROM donations_internal.summaries s WHERE s.currency = p_currency AND ((p_season_id IS NULL AND s.season_id IS NULL) OR s.season_id = p_season_id)), 0),
    COALESCE((SELECT s.monthly_maintenance FROM donations_internal.summaries s WHERE s.currency = p_currency AND ((p_season_id IS NULL AND s.season_id IS NULL) OR s.season_id = p_season_id)), 0);
$$;

CREATE FUNCTION public.get_donator_player_keys(p_player_keys text[])
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT d.player_key FROM donations_internal.donator_player_keys d
  WHERE d.player_key = ANY(p_player_keys);
$$;

REVOKE ALL ON FUNCTION public.submit_donation(text, text, numeric, text, integer, integer, integer, boolean, boolean, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_donation_leaderboard(integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_donation_summary(integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_donator_player_keys(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_donation(text, text, numeric, text, integer, integer, integer, boolean, boolean, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_donation_leaderboard(integer, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_donation_summary(integer, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_donator_player_keys(text[]) TO anon, authenticated, service_role;
