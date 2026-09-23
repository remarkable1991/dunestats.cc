-- Helper: staff checks
CREATE OR REPLACE FUNCTION public.is_match_staff(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (
    public.has_role(_uid, 'admin'::public.app_role)
    OR public.has_role(_uid, 'match_moderator'::public.app_role)
  )
$$;
REVOKE ALL ON FUNCTION public.is_match_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_match_staff(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_tournament_host(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (
    public.has_role(_uid, 'admin'::public.app_role)
    OR public.has_role(_uid, 'tournament_host'::public.app_role)
  )
$$;
REVOKE ALL ON FUNCTION public.is_tournament_host(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_tournament_host(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_tournament_moderator(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (
    public.has_role(_uid, 'admin'::public.app_role)
    OR public.has_role(_uid, 'tournament_moderator'::public.app_role)
  )
$$;
REVOKE ALL ON FUNCTION public.is_tournament_moderator(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_tournament_moderator(uuid) TO authenticated, service_role;

-- Current user's roles (own roles only)
CREATE OR REPLACE FUNCTION public.my_roles()
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(array_agg(role::text), '{}'::text[])
  FROM public.user_roles WHERE user_id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.my_roles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_roles() TO authenticated, service_role;

-- Admin-only: read another user's roles
CREATE OR REPLACE FUNCTION public.admin_list_user_roles(p_user_id uuid)
RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;
  RETURN (SELECT coalesce(array_agg(role::text), '{}'::text[])
          FROM public.user_roles WHERE user_id = p_user_id);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_user_roles(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_user_roles(uuid) TO authenticated, service_role;

-- Admin-only: grant/revoke a role
CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user_id uuid, p_role text, p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role public.app_role;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'No user selected'; END IF;
  IF p_role NOT IN ('admin','tournament_host','tournament_moderator','match_moderator','lfg_admin','moderator') THEN
    RAISE EXCEPTION 'Unknown role';
  END IF;
  IF p_role = 'admin' AND p_user_id = auth.uid() AND NOT p_enabled THEN
    RAISE EXCEPTION 'You cannot remove your own admin role';
  END IF;
  v_role := p_role::public.app_role;

  IF p_enabled THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (p_user_id, v_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = p_user_id AND role = v_role;
  END IF;

  RETURN jsonb_build_object('ok', true, 'roles',
    (SELECT coalesce(array_agg(role::text), '{}'::text[]) FROM public.user_roles WHERE user_id = p_user_id));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_user_role(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text, boolean) TO authenticated, service_role;

-- Tournament moderation: approvals
CREATE OR REPLACE FUNCTION public.reject_pending_tournament_match(p_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_tournament_moderator(auth.uid()) THEN
    RAISE EXCEPTION 'Tournament moderator role required';
  END IF;
  UPDATE public.tournament_pending_matches
    SET status = 'rejected', note = COALESCE(p_note, note),
        reviewed_by = auth.uid(), reviewed_at = now()
    WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Match editing with verification lock
CREATE OR REPLACE FUNCTION public.update_match_details(
  p_game_id uuid, p_end_round integer, p_board_version text,
  p_has_rise_of_ix boolean, p_has_epic_mode boolean, p_has_immortality boolean,
  p_has_base_leaders boolean, p_players jsonb,
  p_conflict_title text DEFAULT NULL::text, p_ai_scan_status text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_staff boolean := false;
  v_participant boolean := false;
  v_current text;
  v_p jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  v_staff := public.is_match_staff(v_uid);

  IF NOT v_staff THEN
    SELECT EXISTS (
      SELECT 1 FROM public.game_results gr
      WHERE gr.game_id = p_game_id
        AND (
          EXISTS (SELECT 1 FROM public.player_ratings pr
                  WHERE pr.claimed_by = v_uid
                    AND lower(btrim(pr.player_key)) = lower(btrim(gr.player_name)))
          OR EXISTS (SELECT 1 FROM public.profiles pf
                     WHERE pf.id = v_uid
                       AND lower(btrim(coalesce(pf.username, ''))) = lower(btrim(gr.player_name)))
        )
    ) INTO v_participant;
  END IF;

  IF NOT v_staff AND NOT v_participant THEN
    RAISE EXCEPTION 'Not allowed to edit this match';
  END IF;

  SELECT ai_scan_status INTO v_current FROM public.games WHERE id = p_game_id;

  IF p_ai_scan_status IS NOT NULL AND p_ai_scan_status NOT IN ('Yes','No','Issue detected','Manually reviewed','Manually verified') THEN
    RAISE EXCEPTION 'Invalid scan status';
  END IF;

  IF p_ai_scan_status = 'Manually verified' AND NOT v_staff THEN
    RAISE EXCEPTION 'Only match moderators can mark a match as manually verified';
  END IF;

  -- Locked: verified matches can only be changed by staff.
  IF v_current = 'Manually verified' AND NOT v_staff THEN
    INSERT INTO public.match_audit_log (game_id, actor_user_id, actor_name, source, action, entity, entity_label, changes)
    VALUES (p_game_id, v_uid, public.match_actor_name(v_uid), 'web', 'blocked_edit', 'game', 'Verified match',
      jsonb_build_object(
        'end_round', p_end_round,
        'board_version', p_board_version,
        'conflict_title', p_conflict_title,
        'has_rise_of_ix', p_has_rise_of_ix,
        'has_epic_mode', p_has_epic_mode,
        'has_immortality', p_has_immortality,
        'has_base_leaders', p_has_base_leaders,
        'players', coalesce(p_players, '[]'::jsonb)));

    UPDATE public.games SET ai_scan_status = 'Issue detected' WHERE id = p_game_id;

    RETURN jsonb_build_object('ok', false, 'locked', true,
      'message', 'This match is manually verified. Your change was logged and the match is flagged for review.');
  END IF;

  IF p_end_round IS NOT NULL AND (p_end_round < 1 OR p_end_round > 20) THEN
    RAISE EXCEPTION 'Invalid end round';
  END IF;

  UPDATE public.games g
     SET end_round = p_end_round,
         conflict_title = NULLIF(btrim(coalesce(p_conflict_title, '')), ''),
         board_version = coalesce(p_board_version, g.board_version),
         has_rise_of_ix = coalesce(p_has_rise_of_ix, g.has_rise_of_ix),
         has_epic_mode = coalesce(p_has_epic_mode, g.has_epic_mode),
         has_immortality = coalesce(p_has_immortality, g.has_immortality),
         ai_scan_status = CASE
           WHEN p_ai_scan_status IS NULL THEN g.ai_scan_status
           WHEN v_staff THEN p_ai_scan_status
           WHEN (CASE p_ai_scan_status WHEN 'Manually verified' THEN 4 WHEN 'Manually reviewed' THEN 3 WHEN 'Yes' THEN 2 ELSE 1 END)
              >= (CASE coalesce(g.ai_scan_status,'No') WHEN 'Manually verified' THEN 4 WHEN 'Manually reviewed' THEN 3 WHEN 'Yes' THEN 2 ELSE 1 END)
             THEN p_ai_scan_status
           ELSE g.ai_scan_status
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
             has_swordmaster = coalesce((v_p->>'has_swordmaster')::boolean, false),
             emperor_level = CASE WHEN v_p ? 'emperor_level' THEN NULLIF(v_p->>'emperor_level','')::int ELSE gr.emperor_level END,
             emperor_alliance = CASE WHEN v_p ? 'emperor_alliance' THEN NULLIF(v_p->>'emperor_alliance','')::boolean ELSE gr.emperor_alliance END,
             spacing_guild_level = CASE WHEN v_p ? 'spacing_guild_level' THEN NULLIF(v_p->>'spacing_guild_level','')::int ELSE gr.spacing_guild_level END,
             spacing_guild_alliance = CASE WHEN v_p ? 'spacing_guild_alliance' THEN NULLIF(v_p->>'spacing_guild_alliance','')::boolean ELSE gr.spacing_guild_alliance END,
             bene_gesserit_level = CASE WHEN v_p ? 'bene_gesserit_level' THEN NULLIF(v_p->>'bene_gesserit_level','')::int ELSE gr.bene_gesserit_level END,
             bene_gesserit_alliance = CASE WHEN v_p ? 'bene_gesserit_alliance' THEN NULLIF(v_p->>'bene_gesserit_alliance','')::boolean ELSE gr.bene_gesserit_alliance END,
             fremen_level = CASE WHEN v_p ? 'fremen_level' THEN NULLIF(v_p->>'fremen_level','')::int ELSE gr.fremen_level END,
             fremen_alliance = CASE WHEN v_p ? 'fremen_alliance' THEN NULLIF(v_p->>'fremen_alliance','')::boolean ELSE gr.fremen_alliance END
       WHERE gr.game_id = p_game_id
         AND lower(btrim(gr.player_name)) = lower(btrim(v_p->>'player_name'));
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- Tournament host access to tournaments table
DROP POLICY IF EXISTS "tournaments_admin_insert" ON public.tournaments;
DROP POLICY IF EXISTS "tournaments_admin_update" ON public.tournaments;
DROP POLICY IF EXISTS "tournaments_admin_delete" ON public.tournaments;
CREATE POLICY "tournaments_host_insert" ON public.tournaments FOR INSERT TO authenticated
  WITH CHECK (public.is_tournament_host(auth.uid()));
CREATE POLICY "tournaments_host_update" ON public.tournaments FOR UPDATE TO authenticated
  USING (public.is_tournament_host(auth.uid())) WITH CHECK (public.is_tournament_host(auth.uid()));
CREATE POLICY "tournaments_host_delete" ON public.tournaments FOR DELETE TO authenticated
  USING (public.is_tournament_host(auth.uid()));