CREATE OR REPLACE FUNCTION public.lfg_is_member(p_row public.active_async_matches, p_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_uid IS NOT NULL AND (
    p_row.web_host_id = p_uid
    OR p_uid = ANY(COALESCE(p_row.web_player_ids, '{}'::uuid[]))
    OR EXISTS (
      SELECT 1 FROM public.player_discord_map m
      WHERE m.claimed_by = p_uid AND m.discord_user_id IS NOT NULL
        AND (m.discord_user_id = p_row.host_id OR m.discord_user_id = ANY(COALESCE(p_row.player_ids, '{}'::text[])))
    )
  );
$$;
REVOKE EXECUTE ON FUNCTION public.lfg_is_member(public.active_async_matches, uuid) FROM anon, public;

CREATE OR REPLACE FUNCTION public.lfg_start_game(p_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.active_async_matches%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Not signed in'); END IF;
  SELECT * INTO v_row FROM public.active_async_matches WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Lobby not found'); END IF;
  IF NOT public.lfg_is_member(v_row, v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only seated players can start this game');
  END IF;
  UPDATE public.active_async_matches SET status = 'started' WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.lfg_link_game(p_id bigint, p_public_match_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.active_async_matches%ROWTYPE;
  v_game uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Not signed in'); END IF;
  SELECT * INTO v_row FROM public.active_async_matches WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Lobby not found'); END IF;
  IF NOT (public.lfg_is_member(v_row, v_uid) OR public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'lfg_admin')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only lobby players or LFG admins can link a result');
  END IF;
  SELECT id INTO v_game FROM public.games
   WHERE upper(public_match_id) = upper(trim(p_public_match_id)) OR id::text = trim(p_public_match_id) LIMIT 1;
  IF v_game IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Match not found'); END IF;
  UPDATE public.active_async_matches
     SET linked_game_id = v_game,
         league_status = CASE WHEN is_league THEN 'reported' ELSE league_status END,
         status = CASE WHEN status = 'searching' THEN 'started' ELSE status END
   WHERE id = p_id;
  RETURN jsonb_build_object('ok', true, 'game_id', v_game);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.lfg_link_game(bigint, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.lfg_link_game(bigint, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.lfg_admin_map_discord(p_discord_user_id text, p_discord_username text, p_player_key text, p_display_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_key text := lower(trim(p_player_key));
  v_target bigint;
BEGIN
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'lfg_admin')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'LFG admins only');
  END IF;
  IF COALESCE(v_key, '') = '' OR COALESCE(trim(p_discord_user_id), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Discord user and in-game name are required');
  END IF;
  SELECT id INTO v_target FROM public.player_discord_map WHERE lower(trim(player_key)) = v_key LIMIT 1;
  IF v_target IS NULL THEN
    SELECT id INTO v_target FROM public.player_discord_map WHERE discord_user_id = trim(p_discord_user_id) LIMIT 1;
  END IF;
  -- Release this Discord account from any other row first
  UPDATE public.player_discord_map
     SET discord_user_id = NULL,
         discord_username = CASE WHEN lower(trim(discord_username)) = lower(trim(p_discord_username)) THEN NULL ELSE discord_username END,
         updated_at = now()
   WHERE (discord_user_id = trim(p_discord_user_id)
          OR (COALESCE(trim(p_discord_username), '') <> '' AND lower(trim(discord_username)) = lower(trim(p_discord_username))))
     AND id IS DISTINCT FROM v_target;
  IF v_target IS NULL THEN
    INSERT INTO public.player_discord_map (player_key, display_name, discord_user_id, discord_username, source)
    VALUES (v_key, COALESCE(NULLIF(trim(p_display_name), ''), trim(p_player_key)), trim(p_discord_user_id), NULLIF(trim(p_discord_username), ''), 'lfg_admin');
  ELSE
    UPDATE public.player_discord_map
       SET player_key = v_key,
           display_name = COALESCE(NULLIF(trim(p_display_name), ''), display_name, trim(p_player_key)),
           discord_user_id = trim(p_discord_user_id),
           discord_username = COALESCE(NULLIF(trim(p_discord_username), ''), discord_username),
           updated_at = now()
     WHERE id = v_target;
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.lfg_admin_map_discord(text, text, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.lfg_admin_map_discord(text, text, text, text) TO authenticated;