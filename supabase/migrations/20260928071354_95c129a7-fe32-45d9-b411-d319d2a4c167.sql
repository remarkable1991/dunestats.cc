DROP FUNCTION IF EXISTS public.approve_pending_tournament_match(uuid, text, text, jsonb, text);
CREATE FUNCTION public.approve_pending_tournament_match(p_id uuid, p_round text DEFAULT NULL::text, p_table text DEFAULT NULL::text, p_name_fixes jsonb DEFAULT '{}'::jsonb, p_match_code text DEFAULT NULL::text, p_single_game_fixes jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.tournament_pending_matches%ROWTYPE;
  v_game_id uuid;
  v_round text;
  v_table text;
  v_img text;
  k text;
  v text;
  r record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  SELECT * INTO v_row FROM public.tournament_pending_matches WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending match not found'; END IF;

  v_round := COALESCE(NULLIF(btrim(p_round), ''), v_row.round_type);
  v_table := COALESCE(NULLIF(btrim(p_table), ''), v_row.table_identifier);
  IF v_round IS NULL OR v_table IS NULL THEN
    RAISE EXCEPTION 'Round and table are required';
  END IF;

  IF NULLIF(btrim(p_match_code), '') IS NOT NULL THEN
    SELECT id INTO v_game_id FROM public.games
      WHERE upper(public_match_id) = upper(btrim(p_match_code));
    IF v_game_id IS NULL THEN RAISE EXCEPTION 'No match found with that Match ID'; END IF;
  ELSE
    v_game_id := v_row.game_id;
  END IF;
  IF v_game_id IS NULL THEN RAISE EXCEPTION 'No game linked to this submission'; END IF;

  -- 1a. Tournament-wide renames
  FOR k, v IN SELECT key, value #>> '{}' FROM jsonb_each(COALESCE(p_name_fixes, '{}'::jsonb)) LOOP
    IF NULLIF(btrim(v), '') IS NULL THEN CONTINUE; END IF;
    UPDATE public.tournament_matches
      SET player_name = btrim(v), updated_at = now()
      WHERE tournament_num = v_row.tournament_num
        AND lower(player_name) = lower(btrim(k));
  END LOOP;

  -- 1b. One-game substitutes: only this table's seat, marked as backup
  FOR k, v IN SELECT key, value #>> '{}' FROM jsonb_each(COALESCE(p_single_game_fixes, '{}'::jsonb)) LOOP
    IF NULLIF(btrim(v), '') IS NULL THEN CONTINUE; END IF;
    UPDATE public.tournament_matches
      SET player_name = btrim(v), is_backup = true, updated_at = now()
      WHERE tournament_num = v_row.tournament_num
        AND round_type = v_round
        AND table_identifier = v_table
        AND lower(player_name) = lower(btrim(k));
  END LOOP;

  UPDATE public.games SET tournament_num = v_row.tournament_num WHERE id = v_game_id;

  SELECT image_url INTO v_img FROM public.games WHERE id = v_game_id;
  IF v_img IS NOT NULL THEN
    INSERT INTO public.tournament_table_screenshots
      (tournament_num, round_type, table_identifier, image_url, created_by)
    VALUES (v_row.tournament_num, v_round, v_table, v_img, auth.uid())
    ON CONFLICT (tournament_num, round_type, table_identifier)
    DO UPDATE SET image_url = EXCLUDED.image_url, created_by = EXCLUDED.created_by;
  END IF;

  FOR r IN SELECT placement, player_name, leader_name, points
           FROM public.game_results WHERE game_id = v_game_id LOOP
    UPDATE public.tournament_matches tm
      SET placement = r.placement, points = r.points, leader_name = r.leader_name, updated_at = now()
      WHERE tm.tournament_num = v_row.tournament_num
        AND tm.round_type = v_round
        AND tm.table_identifier = v_table
        AND lower(tm.player_name) = lower(r.player_name);
  END LOOP;

  UPDATE public.tournament_pending_matches
    SET status = 'approved', round_type = v_round, table_identifier = v_table,
        game_id = v_game_id, reviewed_by = auth.uid(), reviewed_at = now()
    WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'game_id', v_game_id,
    'round_type', v_round, 'table_identifier', v_table);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.approve_pending_tournament_match(uuid, text, text, jsonb, text, jsonb) TO authenticated;