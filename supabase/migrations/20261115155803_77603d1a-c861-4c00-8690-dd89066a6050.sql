ALTER TABLE public.league_match_rating_deltas
  ADD COLUMN rank_before integer,
  ADD COLUMN rank_after integer;

CREATE OR REPLACE FUNCTION public.recalculate_league_rank_history(p_season integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_game record;
  v_count integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('league-rank-history-' || p_season));
  CREATE TEMP TABLE IF NOT EXISTS league_rank_state (
    player_key text PRIMARY KEY,
    elo numeric NOT NULL
  ) ON COMMIT DROP;
  TRUNCATE pg_temp.league_rank_state;

  FOR v_game IN
    SELECT d.game_id, min(g.created_at) AS played_at
    FROM public.league_match_rating_deltas d
    JOIN public.games g ON g.id = d.game_id
    WHERE d.season = p_season
    GROUP BY d.game_id
    ORDER BY min(g.created_at), d.game_id
  LOOP
    UPDATE public.league_match_rating_deltas
    SET rank_before = NULL, rank_after = NULL
    WHERE game_id = v_game.game_id AND season = p_season;

    WITH ranked AS (
      SELECT player_key, rank() OVER (ORDER BY elo DESC) AS position
      FROM pg_temp.league_rank_state
    )
    UPDATE public.league_match_rating_deltas d
    SET rank_before = ranked.position
    FROM ranked
    WHERE d.game_id = v_game.game_id
      AND d.season = p_season
      AND d.player_key = ranked.player_key;

    INSERT INTO pg_temp.league_rank_state (player_key, elo)
    SELECT player_key, 1000 + elo_delta
    FROM public.league_match_rating_deltas
    WHERE game_id = v_game.game_id AND season = p_season
    ON CONFLICT (player_key)
    DO UPDATE SET elo = league_rank_state.elo + EXCLUDED.elo - 1000;

    WITH ranked AS (
      SELECT player_key, rank() OVER (ORDER BY elo DESC) AS position
      FROM pg_temp.league_rank_state
    )
    UPDATE public.league_match_rating_deltas d
    SET rank_after = ranked.position
    FROM ranked
    WHERE d.game_id = v_game.game_id
      AND d.season = p_season
      AND d.player_key = ranked.player_key;

    SELECT count(*) INTO v_count
    FROM public.league_match_rating_deltas
    WHERE game_id = v_game.game_id AND season = p_season;
  END LOOP;

  RETURN (SELECT count(*) FROM public.league_match_rating_deltas WHERE season = p_season);
END;
$$;

CREATE OR REPLACE FUNCTION public.league_rank_history_after_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_season integer;
BEGIN
  FOR v_season IN SELECT DISTINCT season FROM old_rows LOOP
    PERFORM public.recalculate_league_rank_history(v_season);
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.league_rank_history_after_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_season integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM old_rows o
    FULL JOIN new_rows n USING (game_id, player_key, season)
    WHERE o.game_id IS NULL
      OR n.game_id IS NULL
      OR o.elo_delta IS DISTINCT FROM n.elo_delta
  ) THEN
    RETURN NULL;
  END IF;
  FOR v_season IN
    SELECT season FROM old_rows UNION SELECT season FROM new_rows
  LOOP
    PERFORM public.recalculate_league_rank_history(v_season);
  END LOOP;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS league_rank_history_after_delete ON public.league_match_rating_deltas;
CREATE TRIGGER league_rank_history_after_delete
AFTER DELETE ON public.league_match_rating_deltas
REFERENCING OLD TABLE AS old_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.league_rank_history_after_delete();

DROP TRIGGER IF EXISTS league_rank_history_after_update ON public.league_match_rating_deltas;
CREATE TRIGGER league_rank_history_after_update
AFTER UPDATE ON public.league_match_rating_deltas
REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.league_rank_history_after_update();

CREATE OR REPLACE FUNCTION public.apply_league_match_ratings(p_game_id uuid, p_season integer, p_results jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_row jsonb; v_key text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('admin-lobby-revert'));
  PERFORM 1 FROM games WHERE id = p_game_id AND is_league FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'League match not found'; END IF;
  IF jsonb_typeof(p_results) <> 'array' OR jsonb_array_length(p_results) < 2 THEN
    RAISE EXCEPTION 'At least two rating contributions required';
  END IF;
  IF EXISTS(SELECT 1 FROM league_match_rating_deltas WHERE game_id = p_game_id) THEN
    RAISE EXCEPTION 'League ratings already applied for this match';
  END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_results) LOOP
    v_key := lower(btrim(v_row->>'player_key'));
    IF v_key IS NULL
      OR NOT EXISTS(SELECT 1 FROM game_results WHERE game_id = p_game_id AND lower(btrim(player_name)) = v_key)
      OR v_row->>'elo_delta' IS NULL THEN
      RAISE EXCEPTION 'Each contribution must match a seated result and include its Elo delta';
    END IF;
    INSERT INTO league_match_rating_deltas(game_id, player_key, season, elo_delta, won)
    VALUES(p_game_id, v_key, p_season, (v_row->>'elo_delta')::numeric, coalesce((v_row->>'won')::boolean, false));
    INSERT INTO player_league_ratings(player_key, season, elo, games_played, wins)
    VALUES(v_key, p_season, 1000 + (v_row->>'elo_delta')::numeric, 1,
      CASE WHEN coalesce((v_row->>'won')::boolean, false) THEN 1 ELSE 0 END)
    ON CONFLICT(player_key, season) DO UPDATE SET
      elo = player_league_ratings.elo + (v_row->>'elo_delta')::numeric,
      games_played = player_league_ratings.games_played + 1,
      wins = player_league_ratings.wins + CASE WHEN coalesce((v_row->>'won')::boolean, false) THEN 1 ELSE 0 END,
      updated_at = now();
  END LOOP;
  PERFORM public.recalculate_league_rank_history(p_season);
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_league_rank_history(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_league_rank_history(integer) TO service_role;
REVOKE ALL ON FUNCTION public.apply_league_match_ratings(uuid, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_league_match_ratings(uuid, integer, jsonb) TO service_role;

SELECT public.recalculate_league_rank_history(season)
FROM (SELECT DISTINCT season FROM public.league_match_rating_deltas) seasons;
