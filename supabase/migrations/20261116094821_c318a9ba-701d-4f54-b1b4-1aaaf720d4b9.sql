CREATE TABLE public.donations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  donor_name text NOT NULL,
  player_key text,
  user_id uuid,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  tournament_pct integer NOT NULL DEFAULT 50,
  maintenance_pct integer NOT NULL DEFAULT 30,
  developer_pct integer NOT NULL DEFAULT 20,
  hide_name boolean NOT NULL DEFAULT false,
  hide_amount boolean NOT NULL DEFAULT false,
  payment_method text NOT NULL DEFAULT 'paypal',
  donor_note text,
  status text NOT NULL DEFAULT 'pending',
  season_id integer REFERENCES public.sp_seasons(id) ON DELETE SET NULL,
  donated_at timestamp with time zone NOT NULL DEFAULT now(),
  verified_by uuid,
  verified_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT donations_amount_positive CHECK (amount > 0),
  CONSTRAINT donations_currency_valid CHECK (currency IN ('USD', 'EUR', 'GBP')),
  CONSTRAINT donations_percentages_valid CHECK (
    tournament_pct BETWEEN 0 AND 100
    AND maintenance_pct BETWEEN 0 AND 100
    AND developer_pct BETWEEN 0 AND 100
    AND tournament_pct + maintenance_pct + developer_pct = 100
  ),
  CONSTRAINT donations_status_valid CHECK (status IN ('pending', 'verified', 'rejected')),
  CONSTRAINT donations_payment_method_valid CHECK (payment_method IN ('paypal', 'revolut', 'steam', 'gift_card', 'other'))
);
GRANT SELECT ON public.donations TO authenticated;
GRANT ALL ON public.donations TO service_role;
ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Main admins can review donations"
ON public.donations FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX donations_public_board_idx ON public.donations (status, currency, season_id, donated_at DESC);
CREATE INDEX donations_player_badge_idx ON public.donations (player_key, status, hide_name);

CREATE TRIGGER update_donations_updated_at
BEFORE UPDATE ON public.donations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.submit_donation(
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
SECURITY DEFINER
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

CREATE OR REPLACE FUNCTION public.get_donation_leaderboard(
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
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH verified AS (
    SELECT d.*
    FROM public.donations d
    WHERE d.status = 'verified'
      AND d.currency = p_currency
      AND (p_season_id IS NULL OR d.season_id = p_season_id)
  ), ranked AS (
    SELECT v.*,
      CASE WHEN NOT v.hide_amount THEN
        row_number() OVER (ORDER BY v.amount DESC, v.donated_at ASC, v.id ASC)
      END AS calculated_rank
    FROM verified v
  )
  SELECT
    r.id,
    CASE WHEN r.hide_name THEN 'Anonymous Donor' ELSE r.donor_name END,
    CASE WHEN r.hide_name THEN NULL ELSE r.player_key END,
    CASE WHEN r.hide_amount THEN NULL ELSE r.amount END,
    r.currency,
    r.tournament_pct,
    r.maintenance_pct,
    r.developer_pct,
    r.donated_at,
    r.calculated_rank::integer,
    r.hide_amount
  FROM ranked r
  ORDER BY r.hide_amount ASC, r.calculated_rank ASC NULLS LAST, r.donated_at DESC
  LIMIT 200;
$$;

CREATE OR REPLACE FUNCTION public.get_donation_summary(
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
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH verified AS (
    SELECT d.*
    FROM public.donations d
    WHERE d.status = 'verified'
      AND d.currency = p_currency
  ), selected AS (
    SELECT v.* FROM verified v
    WHERE p_season_id IS NULL OR v.season_id = p_season_id
  )
  SELECT
    COALESCE((SELECT sum(s.amount) FROM selected s), 0),
    COALESCE((SELECT round(sum(s.amount * s.tournament_pct / 100.0), 2) FROM selected s), 0),
    COALESCE((SELECT round(sum(s.amount * s.maintenance_pct / 100.0), 2) FROM selected s), 0),
    COALESCE((SELECT round(sum(s.amount * s.developer_pct / 100.0), 2) FROM selected s), 0),
    COALESCE((SELECT count(DISTINCT COALESCE(s.user_id::text, s.player_key, lower(s.donor_name))) FROM selected s), 0)::integer,
    (SELECT count(*) FROM selected s)::integer,
    COALESCE((SELECT round(sum(v.amount * v.maintenance_pct / 100.0), 2)
      FROM verified v
      WHERE v.donated_at >= date_trunc('month', now())
        AND v.donated_at < date_trunc('month', now()) + interval '1 month'), 0);
$$;

CREATE OR REPLACE FUNCTION public.get_donator_player_keys(p_player_keys text[])
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT d.player_key
  FROM public.donations d
  WHERE d.status = 'verified'
    AND d.hide_name = false
    AND d.player_key = ANY(p_player_keys);
$$;

REVOKE ALL ON FUNCTION public.submit_donation(text, text, numeric, text, integer, integer, integer, boolean, boolean, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_donation_leaderboard(integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_donation_summary(integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_donator_player_keys(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_donation(text, text, numeric, text, integer, integer, integer, boolean, boolean, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_donation_leaderboard(integer, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_donation_summary(integer, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_donator_player_keys(text[]) TO anon, authenticated, service_role;
