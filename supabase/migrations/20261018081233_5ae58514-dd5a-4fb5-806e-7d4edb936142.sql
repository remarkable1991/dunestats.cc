CREATE OR REPLACE FUNCTION public.lfg_admin_map_discord(p_discord_user_id text, p_discord_username text, p_player_key text, p_display_name text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_key text := lower(btrim(p_player_key)); v_owner uuid; v_target bigint; v_handle text := nullif(btrim(p_discord_username), '');
BEGIN
 IF v_uid IS NULL OR NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'lfg_admin')) THEN RAISE EXCEPTION 'LFG admins only'; END IF;
 IF v_key IN ('s4ngluten','sangluten') OR EXISTS (SELECT 1 FROM player_discord_map WHERE discord_user_id=btrim(p_discord_user_id) AND player_key IN ('s4ngluten','sangluten')) THEN RAISE EXCEPTION 'This protected mapping requires separate explicit approval'; END IF;
 IF v_key='' OR coalesce(btrim(p_discord_user_id),'') !~ '^[0-9]{6,25}$' THEN RAISE EXCEPTION 'Valid Discord ID and player name required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('discord-map'));
 IF NOT EXISTS (SELECT 1 FROM player_ratings WHERE player_key=v_key) THEN RAISE EXCEPTION 'Player must exist on the leaderboard'; END IF;
 IF (SELECT count(DISTINCT claimed_by) FROM player_ratings WHERE player_key=v_key)>1 THEN RAISE EXCEPTION 'Conflicting claimed accounts require main-admin review'; END IF;
 SELECT claimed_by INTO v_owner FROM player_ratings WHERE player_key=v_key AND claimed_by IS NOT NULL LIMIT 1;
 IF EXISTS (SELECT 1 FROM player_discord_map WHERE (discord_user_id=btrim(p_discord_user_id) AND player_key IS DISTINCT FROM v_key) OR (player_key=v_key AND discord_user_id IS NOT NULL AND discord_user_id<>btrim(p_discord_user_id)) OR (player_key=v_key AND claimed_by IS NOT NULL AND claimed_by IS DISTINCT FROM v_owner)) THEN RAISE EXCEPTION 'An existing link conflicts. Review the accounts before connecting them'; END IF;
 SELECT id INTO v_target FROM player_discord_map WHERE player_key=v_key ORDER BY id LIMIT 1;
 IF v_target IS NULL THEN
 INSERT INTO player_discord_map(player_key,display_name,claimed_by,discord_user_id,discord_username,source) VALUES(v_key,coalesce(nullif(btrim(p_display_name),''),p_player_key),v_owner,btrim(p_discord_user_id),v_handle,'lfg_admin');
 ELSE
 UPDATE player_discord_map SET claimed_by=coalesce(v_owner,claimed_by),discord_user_id=btrim(p_discord_user_id),discord_username=coalesce(v_handle,discord_username),display_name=coalesce(nullif(btrim(p_display_name),''),display_name),source='lfg_admin',updated_at=now() WHERE id=v_target;
 END IF;
 -- Do not mirror a manually confirmed handle onto profiles: the legacy profile trigger can auto-claim unrelated names.
 RETURN jsonb_build_object('ok',true,'claimed_by',v_owner);
END $$;
REVOKE ALL ON FUNCTION public.lfg_admin_map_discord(text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.lfg_admin_map_discord(text,text,text,text) TO authenticated,service_role;

DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef(oid) INTO definition FROM pg_proc WHERE oid='public.lfg_update_lobby(bigint,text,text,text[],text,text,integer,text[],text[],text[])'::regprocedure;
 definition := replace(definition, 'SELECT * INTO v_row FROM public.active_async_matches WHERE id = p_id;', 'SELECT * INTO v_row FROM public.active_async_matches WHERE id = p_id FOR UPDATE;');
 definition := replace(definition, 'SET mode = COALESCE(NULLIF(lower(btrim(p_mode)), ''''), mode),', 'SET mode = CASE WHEN is_league THEN mode ELSE COALESCE(NULLIF(lower(btrim(p_mode)), ''''), mode) END,');
 definition := replace(definition, 'board_type = COALESCE(NULLIF(btrim(p_board), ''''), board_type),', 'board_type = CASE WHEN is_league THEN board_type ELSE COALESCE(NULLIF(btrim(p_board), ''''), board_type) END,');
 definition := replace(definition, 'expansions = COALESCE(p_expansions, expansions),', 'expansions = CASE WHEN is_league THEN expansions ELSE COALESCE(p_expansions, expansions) END,');
 definition := replace(definition, 'message_text = COALESCE(p_notes, message_text),', 'message_text = CASE WHEN is_league THEN message_text ELSE COALESCE(p_notes, message_text) END,');
 definition := replace(definition, 'expires_at = CASE WHEN p_expires_minutes', 'expires_at = CASE WHEN is_league THEN expires_at WHEN p_expires_minutes');
 definition := replace(definition, 'guest_players = v_guests,', 'guest_players = CASE WHEN p_guest_players IS NULL THEN guest_players ELSE v_guests END,');
 EXECUTE definition;
 SELECT pg_get_functiondef(oid) INTO definition FROM pg_proc WHERE oid='public.mm_join_queue(text,integer)'::regprocedure;
 definition := replace(definition, 'IF p_mode NOT IN (''live'',''async'') THEN RAISE EXCEPTION ''Invalid mode''; END IF;', 'IF p_mode IS DISTINCT FROM ''live'' THEN RAISE EXCEPTION ''League queue is Live-only''; END IF;');
 EXECUTE definition;
END $$;

CREATE OR REPLACE FUNCTION public.admin_consolidate_player_records(p_source uuid,p_target uuid,p_confirm_same_person boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_count integer;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Main admins only'; END IF;
 IF p_confirm_same_person IS DISTINCT FROM true OR p_source IS NULL OR p_target IS NULL OR p_source=p_target THEN RAISE EXCEPTION 'Confirm two different accounts belong to the same person'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('player-account-consolidation'));
 PERFORM id FROM profiles WHERE id IN(p_source,p_target) ORDER BY id FOR UPDATE;
 IF (SELECT count(*) FROM profiles WHERE id IN(p_source,p_target))<>2 THEN RAISE EXCEPTION 'Both accounts must exist'; END IF;
 IF EXISTS(SELECT 1 FROM player_ratings WHERE claimed_by IN(p_source,p_target) AND player_key IN('s4ngluten','sangluten')) OR EXISTS(SELECT 1 FROM player_discord_map WHERE claimed_by IN(p_source,p_target) AND player_key IN('s4ngluten','sangluten')) THEN RAISE EXCEPTION 'Protected mapping requires separate explicit approval'; END IF;
 IF EXISTS(SELECT 1 FROM tournament_registrations s JOIN tournament_registrations t USING(tournament_num) WHERE s.user_id=p_source AND t.user_id=p_target) THEN RAISE EXCEPTION 'Both accounts have registrations for the same tournament. Review and merge those registrations first'; END IF;
 IF EXISTS(SELECT 1 FROM user_roles WHERE user_id=p_source AND role<>'user') THEN RAISE EXCEPTION 'Source account has staff permissions. Review those separately first'; END IF;
 UPDATE player_ratings SET claimed_by=p_target,updated_at=now() WHERE claimed_by=p_source;
 GET DIAGNOSTICS v_count=ROW_COUNT;
 UPDATE player_sp SET claimed_by=p_target,updated_at=now() WHERE claimed_by=p_source;
 UPDATE player_discord_map SET claimed_by=p_target,updated_at=now() WHERE claimed_by=p_source;
 UPDATE tournament_registrations SET user_id=p_target,updated_at=now() WHERE user_id=p_source;
 UPDATE sp_events SET user_id=p_target WHERE user_id=p_source;
 RETURN jsonb_build_object('ok',true,'rating_rows',v_count);
END $$;
REVOKE ALL ON FUNCTION public.admin_consolidate_player_records(uuid,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_consolidate_player_records(uuid,uuid,boolean) TO authenticated;

DO $$ DECLARE v_owner uuid; BEGIN
 SELECT claimed_by INTO v_owner FROM player_ratings WHERE player_key='bludgeon' AND claimed_by IS NOT NULL LIMIT 1;
 IF v_owner IS DISTINCT FROM 'b3b1a82f-3f13-45b6-8450-f7a71d94e275'::uuid THEN RAISE EXCEPTION 'BLUDGEON ownership changed; review required'; END IF;
 IF EXISTS(SELECT 1 FROM player_discord_map WHERE discord_user_id='236215014019563520' AND player_key IS DISTINCT FROM 'bludgeon') THEN RAISE EXCEPTION 'BLUDGEON Discord link conflicts'; END IF;
 IF EXISTS(SELECT 1 FROM player_discord_map WHERE player_key='bludgeon' AND ((claimed_by IS NOT NULL AND claimed_by<>v_owner) OR (discord_user_id IS NOT NULL AND discord_user_id<>'236215014019563520'))) THEN RAISE EXCEPTION 'BLUDGEON player link conflicts'; END IF;
 IF EXISTS(SELECT 1 FROM player_discord_map WHERE player_key='bludgeon') THEN
 UPDATE player_discord_map SET claimed_by=v_owner,discord_user_id='236215014019563520',discord_username='bludgeon_',display_name='BLUDGEON',source='lfg_admin',updated_at=now() WHERE player_key='bludgeon';
 ELSE
 INSERT INTO player_discord_map(player_key,display_name,claimed_by,discord_user_id,discord_username,source) VALUES('bludgeon','BLUDGEON',v_owner,'236215014019563520','bludgeon_','lfg_admin');
 END IF;
END $$;