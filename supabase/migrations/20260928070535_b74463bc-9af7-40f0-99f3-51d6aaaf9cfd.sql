CREATE OR REPLACE FUNCTION public.delete_game_with_rating_revert(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_game record;
  v_result record;
  v_rating record;
  v_track public.game_version;
  v_sp record;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized.';
  END IF;

  SELECT id, created_by, game_version INTO v_game FROM public.games WHERE id = p_game_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found.'; END IF;

  IF v_game.created_by IS DISTINCT FROM v_user_id
     AND NOT private.has_role(v_user_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'You can only delete your own matches.';
  END IF;

  FOREACH v_track IN ARRAY ARRAY[v_game.game_version, 'overall'::public.game_version] LOOP
    FOR v_result IN
      SELECT player_name, placement, points, elo_delta, elo_delta_overall
      FROM public.game_results WHERE game_id = p_game_id
    LOOP
      SELECT player_key, elo, games_played, wins, top2, total_points INTO v_rating
      FROM public.player_ratings
      WHERE player_key = lower(btrim(v_result.player_name)) AND game_version = v_track;

      IF FOUND THEN
        UPDATE public.player_ratings
        SET
          elo = round((v_rating.elo - CASE WHEN v_track = 'overall'::public.game_version THEN v_result.elo_delta_overall ELSE v_result.elo_delta END)::numeric, 2),
          games_played = greatest(0, v_rating.games_played - 1),
          wins = greatest(0, v_rating.wins - CASE WHEN v_result.placement = 1 THEN 1 ELSE 0 END),
          top2 = greatest(0, v_rating.top2 - CASE WHEN v_result.placement <= 2 THEN 1 ELSE 0 END),
          total_points = greatest(0, v_rating.total_points - v_result.points),
          updated_at = now()
        WHERE player_key = lower(btrim(v_result.player_name)) AND game_version = v_track;
      END IF;
    END LOOP;
  END LOOP;

  -- Revert SP awarded for this match
  FOR v_sp IN
    SELECT player_key, season_id,
           sum(amount)::int AS total,
           sum(CASE WHEN is_legacy THEN 0 ELSE amount END)::int AS seasonal
    FROM public.sp_events WHERE ref_game_id = p_game_id
    GROUP BY player_key, season_id
  LOOP
    UPDATE public.player_sp
    SET lifetime_sp = greatest(0, lifetime_sp - v_sp.total),
        seasonal_sp = CASE WHEN season_id = v_sp.season_id THEN greatest(0, seasonal_sp - v_sp.seasonal) ELSE seasonal_sp END,
        updated_at = now()
    WHERE player_key = v_sp.player_key;

    IF v_sp.seasonal <> 0 AND v_sp.season_id IS NOT NULL THEN
      UPDATE public.player_season_sp
      SET seasonal_sp = greatest(0, seasonal_sp - v_sp.seasonal), updated_at = now()
      WHERE player_key = v_sp.player_key AND season_id = v_sp.season_id;
    END IF;
  END LOOP;

  DELETE FROM public.sp_events WHERE ref_game_id = p_game_id;

  DELETE FROM public.games WHERE id = p_game_id;

  RETURN jsonb_build_object('ok', true);
END;
$function$;