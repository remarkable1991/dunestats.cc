CREATE OR REPLACE FUNCTION public.update_match_details(p_game_id uuid, p_end_round integer, p_board_version text, p_has_rise_of_ix boolean, p_has_epic_mode boolean, p_has_immortality boolean, p_has_base_leaders boolean, p_players jsonb, p_conflict_title text DEFAULT NULL::text, p_ai_scan_status text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_allowed boolean := false;
  v_p jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  IF public.has_role(v_uid, 'admin') THEN
    v_allowed := true;
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM public.game_results gr
      WHERE gr.game_id = p_game_id
        AND (
          EXISTS (
            SELECT 1 FROM public.player_ratings pr
            WHERE pr.claimed_by = v_uid
              AND lower(btrim(pr.player_key)) = lower(btrim(gr.player_name))
          )
          OR EXISTS (
            SELECT 1 FROM public.profiles pf
            WHERE pf.id = v_uid
              AND lower(btrim(coalesce(pf.username, ''))) = lower(btrim(gr.player_name))
          )
        )
    ) INTO v_allowed;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Not allowed to edit this match';
  END IF;

  IF p_end_round IS NOT NULL AND (p_end_round < 1 OR p_end_round > 20) THEN
    RAISE EXCEPTION 'Invalid end round';
  END IF;

  IF p_ai_scan_status IS NOT NULL AND p_ai_scan_status NOT IN ('Yes','No','Issue detected','Manually reviewed') THEN
    RAISE EXCEPTION 'Invalid scan status';
  END IF;

  UPDATE public.games g
     SET end_round = p_end_round,
         conflict_title = NULLIF(btrim(coalesce(p_conflict_title, '')), ''),
         board_version = coalesce(p_board_version, g.board_version),
         has_rise_of_ix = coalesce(p_has_rise_of_ix, g.has_rise_of_ix),
         has_epic_mode = coalesce(p_has_epic_mode, g.has_epic_mode),
         has_immortality = coalesce(p_has_immortality, g.has_immortality),
         has_base_leaders = coalesce(p_has_base_leaders, g.has_base_leaders),
         ai_scan_status = CASE
           WHEN p_ai_scan_status IS NULL THEN g.ai_scan_status
           WHEN g.ai_scan_status IN ('Yes','Manually reviewed') THEN g.ai_scan_status
           ELSE p_ai_scan_status
         END
   WHERE g.id = p_game_id;

  IF p_players IS NOT NULL THEN
    FOR v_p IN SELECT * FROM jsonb_array_elements(p_players)
    LOOP
      UPDATE public.game_results gr
         SET spice = NULLIF(v_p->>'spice','')::int,
             solaris = NULLIF(v_p->>'solaris','')::int,
             water = NULLIF(v_p->>'water','')::int,
             is_leaver = coalesce((v_p->>'is_leaver')::boolean, false),
             player_color = NULLIF(btrim(coalesce(v_p->>'player_color','')), ''),
             player_slot = NULLIF(v_p->>'player_slot','')::int,
             turn_order = NULLIF(v_p->>'turn_order','')::int,
             has_first_player = coalesce((v_p->>'has_first_player')::boolean, false),
             has_high_council = coalesce((v_p->>'has_high_council')::boolean, false),
             has_swordmaster = coalesce((v_p->>'has_swordmaster')::boolean, false)
       WHERE gr.game_id = p_game_id
         AND lower(btrim(gr.player_name)) = lower(btrim(v_p->>'player_name'));
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$function$;