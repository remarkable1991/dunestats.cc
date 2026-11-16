CREATE OR REPLACE VIEW donations_internal.leaderboard AS
WITH verified AS (
  SELECT d.* FROM public.donations d WHERE d.status = 'verified'
), ranked AS (
  SELECT v.*,
    CASE WHEN NOT v.hide_amount THEN
      row_number() OVER (PARTITION BY v.currency, v.season_id, v.hide_amount ORDER BY v.amount DESC, v.donated_at ASC, v.id ASC)
    END AS seasonal_rank,
    CASE WHEN NOT v.hide_amount THEN
      row_number() OVER (PARTITION BY v.currency, v.hide_amount ORDER BY v.amount DESC, v.donated_at ASC, v.id ASC)
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

CREATE OR REPLACE VIEW donations_internal.summaries AS
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
  FROM verified v
  WHERE v.season_id IS NOT NULL
  GROUP BY v.currency, v.season_id
)
SELECT * FROM all_time
UNION ALL
SELECT * FROM seasonal;

INSERT INTO public.donations (id, donor_name, player_key, amount, currency, tournament_pct, maintenance_pct, developer_pct, hide_name, hide_amount, payment_method, status, donated_at) VALUES
  ('11111111-1111-4111-8111-111111111111', 'Temporary Public Check', 'test-public-donor', 100, 'USD', 50, 30, 20, false, false, 'other', 'verified', now()),
  ('22222222-2222-4222-8222-222222222222', 'Temporary Hidden Check', 'test-hidden-donor', 999, 'USD', 50, 30, 20, true, true, 'other', 'verified', now()),
  ('33333333-3333-4333-8333-333333333333', 'Temporary Pending Check', 'test-pending-donor', 1000, 'USD', 50, 30, 20, false, false, 'other', 'pending', now());

DO $$
DECLARE
  v_public record;
  v_hidden record;
  v_summary record;
  v_badges text[];
BEGIN
  SELECT * INTO v_public FROM public.get_donation_leaderboard(NULL, 'USD') WHERE donation_id = '11111111-1111-4111-8111-111111111111';
  IF NOT FOUND OR v_public.display_name <> 'Temporary Public Check' OR v_public.amount <> 100 OR v_public.donor_rank <> 1 OR v_public.player_key <> 'test-public-donor' THEN
    RAISE EXCEPTION 'Public donation projection failed: %', v_public;
  END IF;

  SELECT * INTO v_hidden FROM public.get_donation_leaderboard(NULL, 'USD') WHERE donation_id = '22222222-2222-4222-8222-222222222222';
  IF NOT FOUND OR v_hidden.display_name <> 'Anonymous Donor' OR v_hidden.amount IS NOT NULL OR v_hidden.donor_rank IS NOT NULL OR v_hidden.player_key IS NOT NULL THEN
    RAISE EXCEPTION 'Hidden donation privacy failed: %', v_hidden;
  END IF;

  IF EXISTS (SELECT 1 FROM public.get_donation_leaderboard(NULL, 'USD') WHERE donation_id = '33333333-3333-4333-8333-333333333333') THEN
    RAISE EXCEPTION 'Pending donation appeared publicly';
  END IF;

  SELECT * INTO v_summary FROM public.get_donation_summary(NULL, 'USD');
  IF v_summary.total_amount <> 1099 OR v_summary.supporter_count <> 2 OR v_summary.donation_count <> 2 THEN
    RAISE EXCEPTION 'Verified summary totals failed: %', v_summary;
  END IF;

  SELECT array_agg(key ORDER BY key) INTO v_badges FROM public.get_donator_player_keys(ARRAY['test-public-donor', 'test-hidden-donor', 'test-pending-donor']) AS key;
  IF v_badges <> ARRAY['test-public-donor'] THEN
    RAISE EXCEPTION 'Donator badge privacy failed: %', v_badges;
  END IF;
END;
$$;

DELETE FROM public.donations WHERE id IN (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333'
);