CREATE OR REPLACE FUNCTION public.lfg_record_result_identities(p_lobby_id bigint, p_pairs jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_lobby active_async_matches%ROWTYPE; p jsonb; v_id text; v_name text; v_key text; v_seat text; v_old text;
  n int := 0; changes jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_lobby FROM active_async_matches WHERE id=p_lobby_id FOR UPDATE;
  IF NOT FOUND OR v_lobby.linked_game_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Lobby has no linked result'); END IF;
  FOR p IN SELECT * FROM jsonb_array_elements(coalesce(p_pairs,'[]'::jsonb)) LOOP
    v_id := nullif(btrim(coalesce(p->>'discord_user_id','')),''); v_name := btrim(p->>'player_name'); v_key := lower(v_name);
    v_seat := nullif(btrim(coalesce(p->>'seat_name','')),'');
    CONTINUE WHEN v_name IS NULL OR v_name='';
    CONTINUE WHEN NOT EXISTS(SELECT 1 FROM game_results WHERE game_id=v_lobby.linked_game_id AND lower(btrim(player_name))=v_key);

    -- Seat name arrays (web seats, guests, expected keys)
    IF v_seat IS NOT NULL AND lower(v_seat)<>v_key THEN
      IF EXISTS(SELECT 1 FROM unnest(coalesce(v_lobby.web_player_names,'{}')) x WHERE lower(btrim(x))=lower(v_seat))
         OR EXISTS(SELECT 1 FROM unnest(coalesce(v_lobby.guest_players,'{}')) x WHERE lower(btrim(x))=lower(v_seat)) THEN
        UPDATE active_async_matches SET
          web_player_names = (SELECT array_agg(CASE WHEN lower(btrim(x))=lower(v_seat) THEN v_name ELSE x END ORDER BY o) FROM unnest(web_player_names) WITH ORDINALITY t(x,o)),
          guest_players = (SELECT array_agg(CASE WHEN lower(btrim(x))=lower(v_seat) THEN v_name ELSE x END ORDER BY o) FROM unnest(guest_players) WITH ORDINALITY t(x,o)),
          expected_player_keys = (SELECT array_agg(CASE WHEN lower(btrim(x))=lower(v_seat) THEN v_key ELSE x END ORDER BY o) FROM unnest(expected_player_keys) WITH ORDINALITY t(x,o))
        WHERE id=p_lobby_id;
        changes := changes || jsonb_build_object('kind','seat_renamed','from',v_seat,'to',v_name);
      END IF;
      IF NOT EXISTS(SELECT 1 FROM player_name_aliases WHERE lower(old_name)=lower(v_seat) AND lower(canonical_name)=v_key) THEN
        INSERT INTO player_name_aliases(old_name, canonical_name) VALUES (v_seat, v_name);
        changes := changes || jsonb_build_object('kind','alias_added','from',v_seat,'to',v_name);
      END IF;
    END IF;

    CONTINUE WHEN v_id IS NULL;
    CONTINUE WHEN NOT (v_id = ANY(coalesce(v_lobby.player_ids,'{}')) OR v_id = v_lobby.host_id);
    -- Name owned by another Discord account: never steal it
    CONTINUE WHEN EXISTS(SELECT 1 FROM player_discord_map WHERE lower(btrim(player_key))=v_key AND discord_user_id IS NOT NULL AND discord_user_id<>v_id);
    SELECT player_key INTO v_old FROM player_discord_map WHERE discord_user_id=v_id AND coalesce(btrim(player_key),'')<>'' LIMIT 1;
    IF v_old IS NOT NULL THEN
      CONTINUE WHEN lower(btrim(v_old))=v_key;
      UPDATE player_discord_map SET player_key=v_key, display_name=v_name, updated_at=now() WHERE discord_user_id=v_id;
      IF NOT EXISTS(SELECT 1 FROM player_name_aliases WHERE lower(old_name)=lower(v_old) AND lower(canonical_name)=v_key) THEN
        INSERT INTO player_name_aliases(old_name, canonical_name) VALUES (v_old, v_name);
      END IF;
      changes := changes || jsonb_build_object('kind','discord_relinked','discord_user_id',v_id,'from',v_old,'to',v_name);
    ELSIF EXISTS(SELECT 1 FROM player_discord_map WHERE lower(btrim(player_key))=v_key) THEN
      UPDATE player_discord_map SET discord_user_id=v_id, updated_at=now() WHERE lower(btrim(player_key))=v_key;
      changes := changes || jsonb_build_object('kind','discord_linked','discord_user_id',v_id,'to',v_name);
    ELSIF EXISTS(SELECT 1 FROM player_discord_map WHERE discord_user_id=v_id) THEN
      UPDATE player_discord_map SET player_key=v_key, display_name=coalesce(display_name,v_name), updated_at=now() WHERE discord_user_id=v_id;
      changes := changes || jsonb_build_object('kind','discord_linked','discord_user_id',v_id,'to',v_name);
    ELSE
      INSERT INTO player_discord_map(player_key,display_name,discord_user_id,discord_username,source)
      SELECT v_key, v_name, v_id, m.discord_username, 'lobby_result'
      FROM (SELECT (SELECT discord_username FROM discord_guild_members WHERE discord_user_id=v_id) AS discord_username) m
      WHERE NOT EXISTS(SELECT 1 FROM player_discord_map x WHERE m.discord_username IS NOT NULL AND lower(btrim(x.discord_username))=lower(btrim(m.discord_username)));
      IF FOUND THEN changes := changes || jsonb_build_object('kind','discord_linked','discord_user_id',v_id,'to',v_name); END IF;
    END IF;
    n := n+1;
  END LOOP;
  IF jsonb_array_length(changes) > 0 THEN
    INSERT INTO lfg_lobby_events(lobby_id, actor_name, kind, detail)
    VALUES (p_lobby_id, 'Result upload', 'identity_auto_update',
      (SELECT string_agg(coalesce(c->>'from','—')||' → '||(c->>'to'), ', ') FROM jsonb_array_elements(changes) c WHERE c->>'kind'<>'alias_added'));
  END IF;
  RETURN jsonb_build_object('ok',true,'mapped',n,'changes',changes);
END $function$;
REVOKE EXECUTE ON FUNCTION public.lfg_record_result_identities(bigint,jsonb) FROM PUBLIC, anon, authenticated;