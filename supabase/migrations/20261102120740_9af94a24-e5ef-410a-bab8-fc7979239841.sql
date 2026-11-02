CREATE OR REPLACE FUNCTION public.lfg_admin_substitute_player(p_lobby_id bigint, p_old_key text, p_new_key text, p_transfer_sp boolean, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_lobby active_async_matches%ROWTYPE;
  v_old text := lower(btrim(p_old_key));
  v_new text := lower(btrim(p_new_key));
  v_new_display text;
  v_event record;
  v_moved int := 0;
  v_in_arrays boolean;
  v_in_discord boolean;
  v_discord_ids text[];
  v_new_keys text[];
BEGIN
  IF p_actor IS NULL OR NOT (has_role(p_actor, 'admin') OR has_role(p_actor, 'lfg_admin')) THEN
    RAISE EXCEPTION 'LFG admins only';
  END IF;
  IF v_old = '' OR v_new = '' OR v_old = v_new THEN
    RAISE EXCEPTION 'Invalid substitution';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('admin-lobby-revert'));
  SELECT * INTO v_lobby FROM active_async_matches WHERE id = p_lobby_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lobby not found'; END IF;

  v_in_arrays :=
    EXISTS (SELECT 1 FROM unnest(COALESCE(v_lobby.expected_player_keys, ARRAY[]::text[])) k WHERE lower(btrim(k)) = v_old)
    OR EXISTS (SELECT 1 FROM unnest(COALESCE(v_lobby.guest_players, ARRAY[]::text[])) g WHERE lower(btrim(g)) = v_old)
    OR EXISTS (SELECT 1 FROM unnest(COALESCE(v_lobby.web_player_names, ARRAY[]::text[])) w WHERE lower(btrim(w)) = v_old);

  v_discord_ids := ARRAY(SELECT DISTINCT d FROM unnest(COALESCE(v_lobby.player_ids, ARRAY[]::text[]) || ARRAY[v_lobby.host_id]) d WHERE d IS NOT NULL);
  v_in_discord := EXISTS (
    SELECT 1 FROM player_discord_map m
    WHERE m.discord_user_id = ANY (v_discord_ids)
      AND lower(btrim(COALESCE(m.player_key, m.display_name, ''))) = v_old
  );

  IF NOT v_in_arrays AND NOT v_in_discord THEN
    RAISE EXCEPTION 'Player % is not seated in this lobby', v_old;
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(COALESCE(v_lobby.expected_player_keys, ARRAY[]::text[])) k WHERE lower(btrim(k)) = v_new)
    OR EXISTS (SELECT 1 FROM unnest(COALESCE(v_lobby.guest_players, ARRAY[]::text[])) g WHERE lower(btrim(g)) = v_new)
    OR EXISTS (SELECT 1 FROM unnest(COALESCE(v_lobby.web_player_names, ARRAY[]::text[])) w WHERE lower(btrim(w)) = v_new)
    OR EXISTS (SELECT 1 FROM player_discord_map m WHERE m.discord_user_id = ANY (v_discord_ids) AND lower(btrim(COALESCE(m.player_key, m.display_name, ''))) = v_new)
  THEN
    RAISE EXCEPTION 'Player % is already seated in this lobby', v_new;
  END IF;

  UPDATE active_async_matches SET
    expected_player_keys = CASE WHEN expected_player_keys IS NULL THEN NULL ELSE (SELECT array_agg(CASE WHEN lower(btrim(x)) = v_old THEN v_new ELSE x END) FROM unnest(expected_player_keys) x) END,
    guest_players = CASE WHEN guest_players IS NULL THEN NULL ELSE (SELECT array_agg(CASE WHEN lower(btrim(x)) = v_old THEN v_new ELSE x END) FROM unnest(guest_players) x) END,
    web_player_names = CASE WHEN web_player_names IS NULL THEN NULL ELSE (SELECT array_agg(CASE WHEN lower(btrim(x)) = v_old THEN v_new ELSE x END) FROM unnest(web_player_names) x) END
  WHERE id = p_lobby_id;

  -- Discord-seated players have no name in the arrays; align expected_player_keys with player_ids so the seat shows the substitute.
  IF NOT v_in_arrays AND v_in_discord AND array_length(v_discord_ids, 1) > 0 THEN
    SELECT array_agg(
      CASE WHEN lower(btrim(COALESCE(m.player_key, m.display_name, d))) = v_old THEN v_new
           ELSE lower(btrim(COALESCE(m.player_key, m.display_name, d))) END
    ) INTO v_new_keys
    FROM unnest(v_discord_ids) d
    LEFT JOIN player_discord_map m ON m.discord_user_id = d;
    UPDATE active_async_matches SET expected_player_keys = v_new_keys, player_ids = v_discord_ids WHERE id = p_lobby_id;
  END IF;

  IF p_transfer_sp THEN
    SELECT display_name INTO v_new_display FROM player_ratings WHERE player_key = v_new AND game_version = 'overall' LIMIT 1;
    FOR v_event IN
      SELECT id, action_type, amount, ref_game_id FROM sp_events
      WHERE player_key = v_old
        AND metadata->>'match_id' = p_lobby_id::text
        AND action_type IN ('match_start_base', 'first_live_game', 'first_weekly_async')
        AND amount > 0
        AND NOT COALESCE((metadata->>'transferred')::boolean, false)
    LOOP
      PERFORM sp_award(v_old, 'substitution_revert', -v_event.amount, now(), v_event.ref_game_id, NULL,
        jsonb_build_object('match_id', p_lobby_id::text, 'transferred_to', v_new, 'orig_action', v_event.action_type));
      PERFORM sp_award(COALESCE(v_new_display, v_new), v_event.action_type, v_event.amount, now(), v_event.ref_game_id, NULL,
        jsonb_build_object('match_id', p_lobby_id::text, 'transferred_from', v_old));
      UPDATE sp_events SET metadata = metadata || jsonb_build_object('transferred', true, 'transferred_to', v_new) WHERE id = v_event.id;
      v_moved := v_moved + 1;
    END LOOP;
  END IF;

  INSERT INTO lfg_lobby_events (lobby_id, actor_name, kind, detail)
  VALUES (p_lobby_id, p_actor::text, 'admin_substitute',
    format('Substituted %s -> %s (%s SP awards moved)', v_old, v_new, v_moved));
  RETURN jsonb_build_object('ok', true, 'sp_awards_moved', v_moved);
END;
$function$;

REVOKE ALL ON FUNCTION public.lfg_admin_substitute_player(bigint, text, text, boolean, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lfg_admin_substitute_player(bigint, text, text, boolean, uuid) TO service_role;