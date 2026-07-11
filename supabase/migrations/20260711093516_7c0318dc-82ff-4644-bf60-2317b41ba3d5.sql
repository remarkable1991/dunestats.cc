
-- =========================================
-- Seasons
-- =========================================
CREATE TABLE public.sp_seasons (
  id integer PRIMARY KEY,
  name text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sp_seasons TO anon, authenticated;
GRANT ALL ON public.sp_seasons TO service_role;
ALTER TABLE public.sp_seasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sp_seasons readable by all" ON public.sp_seasons FOR SELECT USING (true);

INSERT INTO public.sp_seasons (id, name, starts_at, ends_at) VALUES
  (1, 'Season 1', '2026-07-01 00:00:00+00', '2026-10-01 00:00:00+00'),
  (2, 'Season 2', '2026-10-01 00:00:00+00', '2027-01-01 00:00:00+00'),
  (3, 'Season 3', '2027-01-01 00:00:00+00', '2027-04-01 00:00:00+00'),
  (4, 'Season 4', '2027-04-01 00:00:00+00', '2027-07-01 00:00:00+00');

-- =========================================
-- Per-player SP totals (keyed by player_key so unregistered names accumulate)
-- =========================================
CREATE TABLE public.player_sp (
  player_key text PRIMARY KEY,
  display_name text NOT NULL,
  lifetime_sp integer NOT NULL DEFAULT 0,
  seasonal_sp integer NOT NULL DEFAULT 0,
  season_id integer NOT NULL DEFAULT 1 REFERENCES public.sp_seasons(id),
  is_claimed boolean NOT NULL DEFAULT false,
  claimed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX player_sp_lifetime_idx ON public.player_sp (lifetime_sp DESC);
CREATE INDEX player_sp_seasonal_idx ON public.player_sp (season_id, seasonal_sp DESC);
CREATE INDEX player_sp_claimed_by_idx ON public.player_sp (claimed_by);

GRANT SELECT ON public.player_sp TO anon, authenticated;
GRANT ALL ON public.player_sp TO service_role;
ALTER TABLE public.player_sp ENABLE ROW LEVEL SECURITY;
CREATE POLICY "player_sp readable by all" ON public.player_sp FOR SELECT USING (true);

-- =========================================
-- SP audit log
-- =========================================
CREATE TABLE public.sp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_key text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  amount integer NOT NULL,
  is_legacy boolean NOT NULL DEFAULT false,
  season_id integer REFERENCES public.sp_seasons(id),
  ref_game_id uuid,
  ref_tournament_num integer,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sp_events_player_idx ON public.sp_events (player_key, created_at DESC);
CREATE INDEX sp_events_user_idx ON public.sp_events (user_id, created_at DESC);

GRANT SELECT ON public.sp_events TO anon, authenticated;
GRANT ALL ON public.sp_events TO service_role;
ALTER TABLE public.sp_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sp_events readable by all" ON public.sp_events FOR SELECT USING (true);

-- =========================================
-- Helper: current season id at a timestamp
-- =========================================
CREATE OR REPLACE FUNCTION public.sp_season_for(ts timestamptz)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT id FROM public.sp_seasons WHERE ts >= starts_at AND ts < ends_at LIMIT 1;
$$;

-- =========================================
-- Award helper (internal): inserts sp_event and rolls up player_sp
-- =========================================
CREATE OR REPLACE FUNCTION public.sp_award(
  p_player_name text,
  p_action_type text,
  p_amount integer,
  p_at timestamptz,
  p_ref_game_id uuid DEFAULT NULL,
  p_ref_tournament_num integer DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := lower(btrim(p_player_name));
  v_legacy boolean := p_at < '2026-07-01 00:00:00+00';
  v_season_id integer := public.sp_season_for(p_at);
  v_award integer := CASE WHEN v_legacy THEN GREATEST(1, round(p_amount * 0.10)::int) ELSE p_amount END;
  v_seasonal integer := CASE WHEN v_legacy THEN 0 ELSE v_award END;
  v_display text := btrim(p_player_name);
BEGIN
  IF v_key = '' THEN RETURN; END IF;

  INSERT INTO public.sp_events (player_key, action_type, amount, is_legacy, season_id, ref_game_id, ref_tournament_num, metadata, created_at)
  VALUES (v_key, p_action_type, v_award, v_legacy, COALESCE(v_season_id, 1), p_ref_game_id, p_ref_tournament_num, p_metadata, p_at);

  INSERT INTO public.player_sp (player_key, display_name, lifetime_sp, seasonal_sp, season_id, is_claimed, claimed_by)
  VALUES (
    v_key, v_display, v_award, v_seasonal, 1,
    EXISTS (SELECT 1 FROM public.player_ratings WHERE player_key = v_key AND claimed_by IS NOT NULL),
    (SELECT claimed_by FROM public.player_ratings WHERE player_key = v_key AND claimed_by IS NOT NULL LIMIT 1)
  )
  ON CONFLICT (player_key) DO UPDATE SET
    lifetime_sp = public.player_sp.lifetime_sp + EXCLUDED.lifetime_sp,
    seasonal_sp = public.player_sp.seasonal_sp + EXCLUDED.seasonal_sp,
    display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), public.player_sp.display_name),
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.sp_award(text, text, integer, timestamptz, uuid, integer, jsonb) FROM PUBLIC;

-- =========================================
-- Backfill: run once now over historical data
-- =========================================
CREATE OR REPLACE FUNCTION public.sp_backfill()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match_rows integer := 0;
  v_tourney_rows integer := 0;
  r record;
BEGIN
  -- Wipe any prior run so this is idempotent
  DELETE FROM public.sp_events;
  UPDATE public.player_sp SET lifetime_sp = 0, seasonal_sp = 0;

  -- +20 SP per player per uploaded match (uploader/verifier parity)
  FOR r IN
    SELECT gr.player_name, g.id AS game_id, g.created_at
    FROM public.game_results gr
    JOIN public.games g ON g.id = gr.game_id
  LOOP
    PERFORM public.sp_award(r.player_name, 'match_participation', 20, r.created_at, r.game_id, NULL, NULL);
    v_match_rows := v_match_rows + 1;
  END LOOP;

  -- Tournament round wins from live tournament_matches (+30 each)
  FOR r IN
    SELECT player_name, tournament_num, round_type, created_at
    FROM public.tournament_matches
    WHERE placement = 1
  LOOP
    PERFORM public.sp_award(r.player_name, 'tournament_round_win', 30, r.created_at, NULL, r.tournament_num, jsonb_build_object('round', r.round_type));
    v_tourney_rows := v_tourney_rows + 1;
  END LOOP;

  -- Reached Grand Finals (+300) and won them (+500), from tournament_matches
  FOR r IN
    SELECT player_name, tournament_num, placement, created_at
    FROM public.tournament_matches
    WHERE round_type = 'Finals'
  LOOP
    PERFORM public.sp_award(r.player_name, 'tournament_grand_finals_reached', 300, r.created_at, NULL, r.tournament_num, NULL);
    IF r.placement = 1 THEN
      PERFORM public.sp_award(r.player_name, 'tournament_grand_finals_won', 500, r.created_at, NULL, r.tournament_num, NULL);
    END IF;
  END LOOP;

  -- Completion bonus (+100) — appeared in all 5 preliminary rounds of a tournament
  FOR r IN
    SELECT player_name, tournament_num, MAX(created_at) AS created_at
    FROM public.tournament_matches
    WHERE round_type IN ('Game 1','Game 2','Game 3','Game 4','Game 5')
    GROUP BY player_name, tournament_num
    HAVING COUNT(DISTINCT round_type) = 5
  LOOP
    PERFORM public.sp_award(r.player_name, 'tournament_completion', 100, r.created_at, NULL, r.tournament_num, NULL);
  END LOOP;

  -- Historical tournaments in past_tournament_results (all legacy)
  FOR r IN
    SELECT player_name, tournament_num, round_type, placement, created_at
    FROM public.past_tournament_results
  LOOP
    IF r.placement = 1 AND r.round_type <> 'Finals' THEN
      PERFORM public.sp_award(r.player_name, 'tournament_round_win', 30, r.created_at, NULL, r.tournament_num, jsonb_build_object('round', r.round_type));
    END IF;
    IF r.round_type = 'Finals' THEN
      PERFORM public.sp_award(r.player_name, 'tournament_grand_finals_reached', 300, r.created_at, NULL, r.tournament_num, NULL);
      IF r.placement = 1 THEN
        PERFORM public.sp_award(r.player_name, 'tournament_grand_finals_won', 500, r.created_at, NULL, r.tournament_num, NULL);
      END IF;
    END IF;
  END LOOP;

  FOR r IN
    SELECT player_name, tournament_num, MAX(created_at) AS created_at
    FROM public.past_tournament_results
    WHERE round_type IN ('Game 1','Game 2','Game 3','Game 4','Game 5')
    GROUP BY player_name, tournament_num
    HAVING COUNT(DISTINCT round_type) = 5
  LOOP
    PERFORM public.sp_award(r.player_name, 'tournament_completion', 100, r.created_at, NULL, r.tournament_num, NULL);
  END LOOP;

  RETURN jsonb_build_object('match_rows', v_match_rows, 'tournament_win_rows', v_tourney_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.sp_backfill() FROM PUBLIC;

-- Run the backfill now
SELECT public.sp_backfill();

-- =========================================
-- Claim hook: extend claim_player_name to mark player_sp too
-- =========================================
CREATE OR REPLACE FUNCTION public.claim_player_name(p_player_key text, p_reset boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_key text := lower(btrim(p_player_key));
  v_conflicting_claim uuid;
  v_row_count integer;
  v_has_used_reset boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized.';
  END IF;

  IF v_key = '' OR length(v_key) > 64 THEN
    RAISE EXCEPTION 'Player name is invalid.';
  END IF;

  SELECT count(*) INTO v_row_count FROM public.player_ratings WHERE player_key = v_key;
  IF v_row_count = 0 THEN
    RAISE EXCEPTION 'This player isn''t on the leaderboard yet.';
  END IF;

  SELECT claimed_by INTO v_conflicting_claim
  FROM public.player_ratings
  WHERE player_key = v_key AND claimed_by IS NOT NULL AND claimed_by IS DISTINCT FROM v_user_id
  LIMIT 1;

  IF v_conflicting_claim IS NOT NULL THEN
    RAISE EXCEPTION 'This name has already been claimed by another player.';
  END IF;

  IF COALESCE(p_reset, false) THEN
    SELECT has_used_reset INTO v_has_used_reset FROM public.profiles WHERE id = v_user_id;
    IF COALESCE(v_has_used_reset, false) THEN
      RAISE EXCEPTION 'You''ve already used your one-time stats reset.';
    END IF;

    UPDATE public.player_ratings
    SET elo = 1000, games_played = 0, wins = 0, top2 = 0, total_points = 0, updated_at = now()
    WHERE player_key = v_key;

    UPDATE public.profiles SET has_used_reset = true, updated_at = now() WHERE id = v_user_id;
  END IF;

  UPDATE public.player_ratings SET claimed_by = v_user_id, updated_at = now() WHERE player_key = v_key;

  -- New: mark SP record as claimed too
  UPDATE public.player_sp SET is_claimed = true, claimed_by = v_user_id, updated_at = now() WHERE player_key = v_key;

  RETURN jsonb_build_object('ok', true, 'player_key', v_key, 'reset', COALESCE(p_reset, false));
END;
$function$;
