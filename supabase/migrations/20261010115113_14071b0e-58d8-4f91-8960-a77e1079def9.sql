CREATE OR REPLACE FUNCTION public.mm_fill_lobby(p_id bigint)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row active_async_matches%ROWTYPE; q record; v_seats int; v_added int := 0;
BEGIN
  SELECT * INTO v_row FROM active_async_matches WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT COALESCE(v_row.is_league,false) OR v_row.status NOT IN ('searching','pending_creation') THEN RETURN 0; END IF;
  FOR q IN SELECT * FROM matchmaking_queue
           WHERE mode = COALESCE(v_row.mode,'async') AND (expires_at IS NULL OR expires_at > now())
           ORDER BY joined_at LOOP
    v_seats := COALESCE(array_length(v_row.player_ids,1),0) + COALESCE(array_length(v_row.guest_players,1),0)
             + COALESCE(array_length(v_row.web_player_names,1),0);
    EXIT WHEN v_seats >= 4;
    IF (q.user_id IS NOT NULL AND q.user_id = ANY(COALESCE(v_row.web_player_ids,'{}'::uuid[])))
       OR (q.discord_user_id IS NOT NULL AND q.discord_user_id = ANY(COALESCE(v_row.player_ids,'{}'::text[])))
       OR (q.player_key IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(COALESCE(v_row.web_player_names,'{}'::text[]) || COALESCE(v_row.guest_players,'{}'::text[])) n WHERE lower(btrim(n)) = q.player_key)) THEN
      DELETE FROM matchmaking_queue WHERE id = q.id; CONTINUE;
    END IF;
    IF q.user_id IS NOT NULL THEN
      v_row.web_player_ids := COALESCE(v_row.web_player_ids,'{}'::uuid[]) || q.user_id;
      v_row.web_player_names := COALESCE(v_row.web_player_names,'{}'::text[]) || COALESCE(q.display_name, q.player_key, 'Player');
    ELSIF q.discord_user_id IS NOT NULL THEN
      v_row.player_ids := COALESCE(v_row.player_ids,'{}'::text[]) || q.discord_user_id;
    ELSE CONTINUE;
    END IF;
    -- matched players leave both queues
    DELETE FROM matchmaking_queue WHERE (q.user_id IS NOT NULL AND user_id = q.user_id)
      OR (q.discord_user_id IS NOT NULL AND discord_user_id = q.discord_user_id)
      OR (q.player_key IS NOT NULL AND player_key = q.player_key);
    v_added := v_added + 1;
  END LOOP;
  IF v_added > 0 THEN
    UPDATE active_async_matches SET web_player_ids = v_row.web_player_ids, web_player_names = v_row.web_player_names,
      player_ids = v_row.player_ids WHERE id = p_id;
  END IF;
  RETURN v_added;
END $$;
REVOKE ALL ON FUNCTION public.mm_fill_lobby(bigint) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mm_fill_new_league_lobby()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(NEW.is_league,false) THEN PERFORM mm_fill_lobby(NEW.id); END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_mm_fill_new_league_lobby ON public.active_async_matches;
CREATE TRIGGER trg_mm_fill_new_league_lobby AFTER INSERT ON public.active_async_matches
  FOR EACH ROW EXECUTE FUNCTION public.mm_fill_new_league_lobby();

CREATE OR REPLACE FUNCTION public.mm_join_queue(p_mode text, p_duration_minutes integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_ign text; v_key text; v_discord text; v_allowed int[];
  v_open bigint; v_count int; v_p record; v_new bigint;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF NOT (has_role(v_uid,'admin') OR has_role(v_uid,'lfg_admin')) THEN RAISE EXCEPTION 'Pilot is limited to LFG admins'; END IF;
  IF p_mode NOT IN ('live','async') THEN RAISE EXCEPTION 'Invalid mode'; END IF;
  v_allowed := CASE WHEN p_mode='live' THEN ARRAY[5,15,30,45,60] ELSE ARRAY[60,120,360,720] END;
  IF NOT (p_duration_minutes = ANY(v_allowed)) THEN RAISE EXCEPTION 'Invalid duration'; END IF;
  v_ign := lfg_my_ign();
  IF v_ign IS NULL OR btrim(v_ign)='' THEN RAISE EXCEPTION 'Claim your in-game name first'; END IF;
  v_key := lower(btrim(v_ign));
  SELECT discord_user_id INTO v_discord FROM player_discord_map
   WHERE (claimed_by = v_uid OR lower(player_key) = v_key) AND discord_user_id IS NOT NULL
   ORDER BY (claimed_by = v_uid) DESC NULLS LAST LIMIT 1;
  DELETE FROM matchmaking_queue WHERE mode = p_mode
    AND (user_id = v_uid OR lower(player_key) = v_key OR (v_discord IS NOT NULL AND discord_user_id = v_discord));
  INSERT INTO matchmaking_queue(mode, user_id, player_key, display_name, discord_user_id, duration_minutes, joined_at, expires_at)
  VALUES (p_mode, v_uid, v_key, v_ign, v_discord, p_duration_minutes, now(), now() + make_interval(mins => p_duration_minutes));

  -- 1) an open league table for this mode takes the player right away
  FOR v_open IN SELECT id FROM active_async_matches
     WHERE COALESCE(is_league,false) AND mode = p_mode AND status IN ('searching','pending_creation')
       AND (expires_at IS NULL OR expires_at > now())
       AND COALESCE(array_length(player_ids,1),0)+COALESCE(array_length(guest_players,1),0)+COALESCE(array_length(web_player_names,1),0) < 4
     ORDER BY created_at LOOP
    PERFORM mm_fill_lobby(v_open);
    IF NOT EXISTS (SELECT 1 FROM matchmaking_queue WHERE mode = p_mode AND user_id = v_uid) THEN
      RETURN jsonb_build_object('ok', true, 'linked_discord', v_discord IS NOT NULL, 'seated', true, 'lobby_id', v_open);
    END IF;
  END LOOP;

  -- 2) four waiting -> start a league table with the active format
  SELECT count(*) INTO v_count FROM matchmaking_queue
   WHERE mode = p_mode AND (expires_at IS NULL OR expires_at > now());
  IF v_count >= 4 THEN
    SELECT * INTO v_p FROM league_presets WHERE start_date <= now() AND end_date > now()
      ORDER BY start_date DESC, id DESC LIMIT 1;
    INSERT INTO active_async_matches (message_id, channel_id, guild_id, host_id, status, message_text,
      board_type, expansions, modules, mode, web_player_ids, web_player_names, guest_players, player_ids,
      expires_at, is_league, league_status)
    VALUES ('', '', '', v_uid::text, 'pending_creation', 'League queue match',
      COALESCE(v_p.board_type,'Uprising'), COALESCE(v_p.expansions,'{}'::text[]), COALESCE(v_p.modules,'{}'::text[]), p_mode,
      '{}'::uuid[], '{}'::text[], '{}'::text[], '{}'::text[],
      now() + CASE WHEN p_mode='live' THEN interval '3 hours' ELSE interval '15 hours' END, true, 'open')
    RETURNING id INTO v_new; -- trigger seats the 4 queued players
    UPDATE active_async_matches SET lobby_password = 'sa' || v_new,
      web_host_id = (web_player_ids)[1]
     WHERE id = v_new;
    RETURN jsonb_build_object('ok', true, 'linked_discord', v_discord IS NOT NULL, 'seated', true, 'lobby_id', v_new, 'created', true);
  END IF;
  RETURN jsonb_build_object('ok', true, 'linked_discord', v_discord IS NOT NULL, 'seated', false);
END $$;