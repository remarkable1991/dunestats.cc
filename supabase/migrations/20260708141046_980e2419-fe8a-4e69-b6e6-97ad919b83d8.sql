CREATE OR REPLACE FUNCTION public.delete_game_with_rating_revert(p_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_game record;
  v_result record;
  v_rating record;
  v_track public.game_version;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized.';
  END IF;

  SELECT id, created_by, game_version
  INTO v_game
  FROM public.games
  WHERE id = p_game_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found.';
  END IF;

  IF v_game.created_by IS DISTINCT FROM v_user_id
     AND NOT private.has_role(v_user_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'You can only delete your own matches.';
  END IF;

  FOREACH v_track IN ARRAY ARRAY[v_game.game_version, 'overall'::public.game_version] LOOP
    FOR v_result IN
      SELECT player_name, placement, points, elo_delta, elo_delta_overall
      FROM public.game_results
      WHERE game_id = p_game_id
    LOOP
      SELECT player_key, elo, games_played, wins, top2, total_points
      INTO v_rating
      FROM public.player_ratings
      WHERE player_key = lower(btrim(v_result.player_name))
        AND game_version = v_track;

      IF FOUND THEN
        UPDATE public.player_ratings
        SET
          elo = round((v_rating.elo - CASE WHEN v_track = 'overall'::public.game_version THEN v_result.elo_delta_overall ELSE v_result.elo_delta END)::numeric, 2),
          games_played = greatest(0, v_rating.games_played - 1),
          wins = greatest(0, v_rating.wins - CASE WHEN v_result.placement = 1 THEN 1 ELSE 0 END),
          top2 = greatest(0, v_rating.top2 - CASE WHEN v_result.placement <= 2 THEN 1 ELSE 0 END),
          total_points = greatest(0, v_rating.total_points - v_result.points),
          updated_at = now()
        WHERE player_key = lower(btrim(v_result.player_name))
          AND game_version = v_track;
      END IF;
    END LOOP;
  END LOOP;

  DELETE FROM public.games WHERE id = p_game_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_game_with_rating_revert(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_game_with_rating_revert(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_player_name(p_player_key text, p_reset boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  SELECT count(*)
  INTO v_row_count
  FROM public.player_ratings
  WHERE player_key = v_key;

  IF v_row_count = 0 THEN
    RAISE EXCEPTION 'This player isn''t on the leaderboard yet.';
  END IF;

  SELECT claimed_by
  INTO v_conflicting_claim
  FROM public.player_ratings
  WHERE player_key = v_key
    AND claimed_by IS NOT NULL
    AND claimed_by IS DISTINCT FROM v_user_id
  LIMIT 1;

  IF v_conflicting_claim IS NOT NULL THEN
    RAISE EXCEPTION 'This name has already been claimed by another player.';
  END IF;

  IF COALESCE(p_reset, false) THEN
    SELECT has_used_reset
    INTO v_has_used_reset
    FROM public.profiles
    WHERE id = v_user_id;

    IF COALESCE(v_has_used_reset, false) THEN
      RAISE EXCEPTION 'You''ve already used your one-time stats reset.';
    END IF;

    UPDATE public.player_ratings
    SET
      elo = 1000,
      games_played = 0,
      wins = 0,
      top2 = 0,
      total_points = 0,
      updated_at = now()
    WHERE player_key = v_key;

    UPDATE public.profiles
    SET has_used_reset = true,
        updated_at = now()
    WHERE id = v_user_id;
  END IF;

  UPDATE public.player_ratings
  SET claimed_by = v_user_id,
      updated_at = now()
  WHERE player_key = v_key;

  RETURN jsonb_build_object('ok', true, 'player_key', v_key, 'reset', COALESCE(p_reset, false));
END;
$$;

REVOKE ALL ON FUNCTION public.claim_player_name(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_player_name(text, boolean) TO authenticated;