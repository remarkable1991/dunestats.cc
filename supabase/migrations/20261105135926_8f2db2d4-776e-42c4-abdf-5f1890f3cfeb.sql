CREATE OR REPLACE FUNCTION public.lfg_cancel_sp_plan(p_lobby_id bigint, p_mode text, p_actor uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE
  v_lobby active_async_matches%ROWTYPE;
  e record; c record;
  v_lines jsonb := '[]'::jsonb;
  v_total integer := 0; v_kept integer := 0;
  v_target text;
BEGIN
  IF p_mode NOT IN ('preview','reassign','cancel') THEN RAISE EXCEPTION 'Invalid mode'; END IF;
  IF p_mode <> 'preview' THEN PERFORM pg_advisory_xact_lock(hashtext('admin-lobby-revert')); END IF;
  SELECT * INTO v_lobby FROM active_async_matches WHERE id = p_lobby_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lobby not found'; END IF;
  IF p_mode = 'cancel' AND v_lobby.linked_game_id IS NOT NULL THEN RAISE EXCEPTION 'A result is linked to this lobby; only an admin can cancel it'; END IF;

  FOR e IN SELECT * FROM sp_events WHERE metadata->>'match_id' = p_lobby_id::text
           AND action_type IN ('match_start_base','first_live_game','first_weekly_async') ORDER BY player_key, created_at LOOP
    v_target := NULL;
    IF e.action_type IN ('first_live_game','first_weekly_async') THEN
      -- earliest later game start by the same player in the same UTC day (daily) or week (weekly) that did not get this bonus
      SELECT s.metadata->>'match_id' AS match_id, s.created_at INTO c
      FROM sp_events s
      JOIN active_async_matches l ON l.id::text = s.metadata->>'match_id'
      WHERE s.action_type = 'match_start_base' AND s.player_key = e.player_key
        AND s.metadata->>'match_id' <> p_lobby_id::text
        AND l.status <> 'cancelled'
        AND coalesce(l.mode,'') = coalesce(v_lobby.mode,'')
        AND s.created_at > e.created_at
        AND CASE WHEN e.action_type = 'first_live_game'
                 THEN (s.created_at AT TIME ZONE 'UTC')::date = (e.created_at AT TIME ZONE 'UTC')::date
                 ELSE date_trunc('week', s.created_at AT TIME ZONE 'UTC') = date_trunc('week', e.created_at AT TIME ZONE 'UTC') END
        AND NOT EXISTS (SELECT 1 FROM sp_events x WHERE x.player_key = e.player_key AND x.action_type = e.action_type
                          AND x.metadata->>'match_id' = s.metadata->>'match_id')
      ORDER BY s.created_at LIMIT 1;
      IF FOUND THEN v_target := c.match_id; END IF;
    END IF;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object('player_key', e.player_key, 'action_type', e.action_type,
      'amount', e.amount, 'moved_to_lobby', v_target));
    IF v_target IS NULL THEN v_total := v_total + e.amount; ELSE v_kept := v_kept + e.amount; END IF;

    IF p_mode <> 'preview' AND v_target IS NOT NULL THEN
      INSERT INTO sp_events(player_key, user_id, action_type, amount, is_legacy, season_id, metadata)
      VALUES (e.player_key, e.user_id, e.action_type, e.amount, e.is_legacy, e.season_id,
        coalesce(e.metadata,'{}'::jsonb) || jsonb_build_object('match_id', v_target, 'moved_from_match_id', p_lobby_id::text));
      UPDATE player_sp SET lifetime_sp = lifetime_sp + e.amount,
        seasonal_sp = CASE WHEN season_id = e.season_id AND NOT e.is_legacy THEN seasonal_sp + e.amount ELSE seasonal_sp END,
        updated_at = now() WHERE player_key = e.player_key;
      IF NOT e.is_legacy THEN
        UPDATE player_season_sp SET seasonal_sp = seasonal_sp + e.amount, updated_at = now()
        WHERE player_key = e.player_key AND season_id = e.season_id;
      END IF;
    END IF;

    IF p_mode = 'cancel' THEN
      DELETE FROM sp_events WHERE id = e.id;
      UPDATE player_sp SET lifetime_sp = greatest(0, lifetime_sp - e.amount),
        seasonal_sp = CASE WHEN season_id = e.season_id AND NOT e.is_legacy THEN greatest(0, seasonal_sp - e.amount) ELSE seasonal_sp END,
        updated_at = now() WHERE player_key = e.player_key;
      IF NOT e.is_legacy THEN
        UPDATE player_season_sp SET seasonal_sp = greatest(0, seasonal_sp - e.amount), updated_at = now()
        WHERE player_key = e.player_key AND season_id = e.season_id;
      END IF;
    END IF;
  END LOOP;

  IF p_mode = 'cancel' THEN
    UPDATE active_async_matches SET status = 'cancelled', auto_start_at = NULL,
      league_status = CASE WHEN is_league THEN 'cancelled' ELSE league_status END WHERE id = p_lobby_id;
    INSERT INTO lfg_lobby_events(lobby_id, actor_name, kind, detail)
    VALUES (p_lobby_id, coalesce(p_actor::text,'system'), 'cancel_revert',
      'Cancelled started game. Removed SP: ' || v_total || '; daily/weekly bonus moved to later games: ' || v_kept);
  END IF;

  RETURN jsonb_build_object('ok', true, 'lines', v_lines, 'sp_removed', v_total, 'sp_moved', v_kept,
    'linked', v_lobby.linked_game_id IS NOT NULL, 'status', v_lobby.status);
END $$;
REVOKE ALL ON FUNCTION public.lfg_cancel_sp_plan(bigint, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lfg_cancel_sp_plan(bigint, text, uuid) TO service_role;