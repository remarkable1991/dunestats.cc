
CREATE OR REPLACE FUNCTION public.promote_to_grandfinal(
  p_tournament_num integer,
  p_players text[]
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_existing integer;
  v_name text;
  v_discord text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Unauthorized.'; END IF;
  IF array_length(p_players, 1) IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'Grand Final needs exactly 4 players.';
  END IF;

  SELECT count(*) INTO v_existing FROM public.tournament_matches
    WHERE tournament_num = p_tournament_num
      AND round_type = 'Finals'
      AND table_identifier = 'Grand Final!';
  IF v_existing > 0 THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  FOREACH v_name IN ARRAY p_players LOOP
    SELECT discord_username INTO v_discord FROM public.tournament_matches
      WHERE tournament_num = p_tournament_num AND player_name = v_name
      LIMIT 1;
    INSERT INTO public.tournament_matches
      (tournament_num, round_type, table_identifier, player_name, discord_username)
    VALUES
      (p_tournament_num, 'Finals', 'Grand Final!', v_name, v_discord);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'inserted', 4);
END;
$$;
GRANT EXECUTE ON FUNCTION public.promote_to_grandfinal(integer, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.archive_tournament(
  p_tournament_num integer,
  p_board text,
  p_ix boolean,
  p_epic boolean,
  p_immo boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_gf_complete integer;
  v_moved integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Unauthorized.'; END IF;

  SELECT count(*) INTO v_gf_complete FROM public.tournament_matches
    WHERE tournament_num = p_tournament_num
      AND round_type = 'Finals'
      AND table_identifier = 'Grand Final!'
      AND placement IS NOT NULL AND points IS NOT NULL;
  IF v_gf_complete < 4 THEN
    RAISE EXCEPTION 'Grand Final not complete.';
  END IF;

  INSERT INTO public.past_tournament_results
    (tournament_num, round_type, table_identifier, placement, player_name, leader_name, points,
     board_version, has_rise_of_ix, has_epic_mode, has_immortality)
  SELECT tm.tournament_num, tm.round_type, tm.table_identifier,
         tm.placement, tm.player_name, tm.leader_name, COALESCE(tm.points, 0),
         COALESCE(p_board, 'uprising'),
         COALESCE(p_ix, false),
         COALESCE(p_epic, false),
         COALESCE(p_immo, false)
  FROM public.tournament_matches tm
  WHERE tm.tournament_num = p_tournament_num
    AND tm.placement IS NOT NULL AND tm.points IS NOT NULL;

  GET DIAGNOSTICS v_moved = ROW_COUNT;

  DELETE FROM public.tournament_matches WHERE tournament_num = p_tournament_num;

  RETURN jsonb_build_object('ok', true, 'moved', v_moved);
END;
$$;
GRANT EXECUTE ON FUNCTION public.archive_tournament(integer, text, boolean, boolean, boolean) TO authenticated;
