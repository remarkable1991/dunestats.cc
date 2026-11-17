CREATE OR REPLACE FUNCTION public.assign_donation_season()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  SELECT s.id INTO NEW.season_id
  FROM public.sp_seasons s
  WHERE NEW.donated_at >= s.starts_at AND NEW.donated_at < s.ends_at
  ORDER BY s.starts_at DESC
  LIMIT 1;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_donation_season() FROM PUBLIC;

DROP TRIGGER IF EXISTS assign_donation_season_on_insert ON public.donations;
CREATE TRIGGER assign_donation_season_on_insert
BEFORE INSERT ON public.donations
FOR EACH ROW EXECUTE FUNCTION public.assign_donation_season();

DROP TRIGGER IF EXISTS assign_donation_season_on_date_change ON public.donations;
CREATE TRIGGER assign_donation_season_on_date_change
BEFORE UPDATE OF donated_at ON public.donations
FOR EACH ROW EXECUTE FUNCTION public.assign_donation_season();

UPDATE public.donations d
SET season_id = (
  SELECT s.id FROM public.sp_seasons s
  WHERE d.donated_at >= s.starts_at AND d.donated_at < s.ends_at
  ORDER BY s.starts_at DESC LIMIT 1
);

DROP FUNCTION public.get_donation_leaderboard(integer, text);
DROP FUNCTION public.get_donation_summary(integer, text);
DROP VIEW donations_internal.leaderboard;
DROP VIEW donations_internal.summaries;

CREATE OR REPLACE VIEW donations_internal.leaderboard AS
WITH verified AS (
  SELECT d.*,
    d.amount * CASE d.currency WHEN 'USD' THEN 1.00 WHEN 'EUR' THEN 1.08 WHEN 'GBP' THEN 1.28 ELSE 1.00 END AS amount_usd
  FROM public.donations d WHERE d.status = 'verified'
), ranked AS (
  SELECT v.*,
    CASE WHEN NOT v.hide_amount THEN
      row_number() OVER (PARTITION BY v.season_id ORDER BY v.amount_usd DESC, v.donated_at ASC, v.id ASC)
    END AS seasonal_rank,
    CASE WHEN NOT v.hide_amount THEN
      row_number() OVER (ORDER BY v.amount_usd DESC, v.donated_at ASC, v.id ASC)
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
  r.hide_amount AS amount_hidden,
  CASE WHEN r.hide_amount THEN NULL ELSE round(r.amount_usd, 2) END AS amount_usd
FROM ranked r;

CREATE OR REPLACE VIEW donations_internal.summaries AS
WITH verified AS (
  SELECT d.*,
    d.amount * CASE d.currency WHEN 'USD' THEN 1.00 WHEN 'EUR' THEN 1.08 WHEN 'GBP' THEN 1.28 ELSE 1.00 END AS amount_usd
  FROM public.donations d WHERE d.status = 'verified'
), all_time AS (
  SELECT
    NULL::integer AS season_id,
    round(sum(v.amount_usd), 2) AS total_amount,
    round(sum(v.amount_usd * v.tournament_pct / 100.0), 2) AS tournament_total,
    round(sum(v.amount_usd * v.maintenance_pct / 100.0), 2) AS maintenance_total,
    round(sum(v.amount_usd * v.developer_pct / 100.0), 2) AS developer_total,
    count(DISTINCT COALESCE(v.user_id::text, v.player_key, lower(v.donor_name)))::integer AS supporter_count,
    count(*)::integer AS donation_count,
    round(sum(CASE WHEN v.donated_at >= date_trunc('month', now()) AND v.donated_at < date_trunc('month', now()) + interval '1 month' THEN v.amount_usd * v.maintenance_pct / 100.0 ELSE 0 END), 2) AS monthly_maintenance
  FROM verified v
), seasonal AS (
  SELECT
    v.season_id,
    round(sum(v.amount_usd), 2) AS total_amount,
    round(sum(v.amount_usd * v.tournament_pct / 100.0), 2) AS tournament_total,
    round(sum(v.amount_usd * v.maintenance_pct / 100.0), 2) AS maintenance_total,
    round(sum(v.amount_usd * v.developer_pct / 100.0), 2) AS developer_total,
    count(DISTINCT COALESCE(v.user_id::text, v.player_key, lower(v.donor_name)))::integer AS supporter_count,
    count(*)::integer AS donation_count,
    round(sum(CASE WHEN v.donated_at >= date_trunc('month', now()) AND v.donated_at < date_trunc('month', now()) + interval '1 month' THEN v.amount_usd * v.maintenance_pct / 100.0 ELSE 0 END), 2) AS monthly_maintenance
  FROM verified v GROUP BY v.season_id
)
SELECT * FROM all_time
UNION ALL
SELECT * FROM seasonal;

GRANT SELECT ON donations_internal.leaderboard TO anon, authenticated, service_role;
GRANT SELECT ON donations_internal.summaries TO anon, authenticated, service_role;

CREATE FUNCTION public.get_donation_leaderboard(
  p_season_id integer DEFAULT NULL
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
  amount_hidden boolean,
  amount_usd numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    l.donation_id, l.display_name, l.player_key, l.amount, l.currency,
    l.tournament_pct, l.maintenance_pct, l.developer_pct, l.donated_at,
    CASE WHEN p_season_id IS NULL THEN l.all_time_rank ELSE l.seasonal_rank END AS donor_rank,
    l.amount_hidden, l.amount_usd
  FROM donations_internal.leaderboard l
  WHERE p_season_id IS NULL OR l.season_id = p_season_id
  ORDER BY l.amount_hidden ASC, donor_rank ASC NULLS LAST, l.donated_at DESC
  LIMIT 200;
$$;

CREATE FUNCTION public.get_donation_summary(
  p_season_id integer DEFAULT NULL
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
    COALESCE((SELECT s.total_amount FROM donations_internal.summaries s WHERE (p_season_id IS NULL AND s.season_id IS NULL) OR s.season_id = p_season_id), 0),
    COALESCE((SELECT s.tournament_total FROM donations_internal.summaries s WHERE (p_season_id IS NULL AND s.season_id IS NULL) OR s.season_id = p_season_id), 0),
    COALESCE((SELECT s.maintenance_total FROM donations_internal.summaries s WHERE (p_season_id IS NULL AND s.season_id IS NULL) OR s.season_id = p_season_id), 0),
    COALESCE((SELECT s.developer_total FROM donations_internal.summaries s WHERE (p_season_id IS NULL AND s.season_id IS NULL) OR s.season_id = p_season_id), 0),
    COALESCE((SELECT s.supporter_count FROM donations_internal.summaries s WHERE (p_season_id IS NULL AND s.season_id IS NULL) OR s.season_id = p_season_id), 0),
    COALESCE((SELECT s.donation_count FROM donations_internal.summaries s WHERE (p_season_id IS NULL AND s.season_id IS NULL) OR s.season_id = p_season_id), 0),
    COALESCE((SELECT s.monthly_maintenance FROM donations_internal.summaries s WHERE (p_season_id IS NULL AND s.season_id IS NULL) OR s.season_id = p_season_id), 0);
$$;

REVOKE ALL ON FUNCTION public.get_donation_leaderboard(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_donation_summary(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_donation_leaderboard(integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_donation_summary(integer) TO anon, authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.donations WHERE id = '6b8bfb5c-c10d-4704-83ce-3c500f97918c' AND season_id = 0) THEN
    RAISE EXCEPTION 'September donation was not assigned to Season 0';
  END IF;
  IF (SELECT count(*) FROM public.get_donation_leaderboard(NULL)) <> (SELECT count(*) FROM public.donations WHERE status = 'verified') THEN
    RAISE EXCEPTION 'Unified donation leaderboard omitted a verified donation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.get_donation_leaderboard(NULL) WHERE amount_hidden AND (amount IS NOT NULL OR amount_usd IS NOT NULL OR donor_rank IS NOT NULL)) THEN
    RAISE EXCEPTION 'Hidden donation amounts or ranks were exposed';
  END IF;
END;
$$;