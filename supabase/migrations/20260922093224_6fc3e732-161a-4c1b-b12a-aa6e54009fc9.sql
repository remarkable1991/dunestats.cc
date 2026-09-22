
-- Read access for the LFG hub
GRANT SELECT ON public.active_async_matches TO anon, authenticated;
GRANT ALL ON public.active_async_matches TO service_role;
GRANT SELECT ON public.lobby_quick_chats TO anon, authenticated;
GRANT INSERT ON public.lobby_quick_chats TO authenticated;
GRANT ALL ON public.lobby_quick_chats TO service_role;

ALTER TABLE public.active_async_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lobby_quick_chats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lfg_public_read" ON public.active_async_matches;
CREATE POLICY "lfg_public_read" ON public.active_async_matches
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "lfg_chat_public_read" ON public.lobby_quick_chats;
CREATE POLICY "lfg_chat_public_read" ON public.lobby_quick_chats
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "lfg_chat_insert" ON public.lobby_quick_chats;
CREATE POLICY "lfg_chat_insert" ON public.lobby_quick_chats
  FOR INSERT TO authenticated WITH CHECK (true);

-- Resolve the claimed in-game name for a user
CREATE OR REPLACE FUNCTION public.lfg_my_ign()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT display_name FROM public.player_ratings WHERE claimed_by = auth.uid() ORDER BY games_played DESC LIMIT 1),
    (SELECT display_name FROM public.player_discord_map WHERE claimed_by = auth.uid() LIMIT 1)
  );
$$;

CREATE OR REPLACE FUNCTION public.lfg_create_lobby(
  p_mode text,
  p_board text,
  p_expansions text[],
  p_notes text,
  p_password text,
  p_expires_minutes integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ign text;
  v_id bigint;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not signed in');
  END IF;
  v_ign := public.lfg_my_ign();
  IF v_ign IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You must claim your in-game name to create a lobby.');
  END IF;

  INSERT INTO public.active_async_matches (
    message_id, channel_id, guild_id, host_id, status, message_text,
    lobby_password, board_type, expansions, mode,
    web_host_id, web_player_ids, web_player_names,
    expires_at
  ) VALUES (
    '', '', '', v_uid::text, 'pending_creation', COALESCE(NULLIF(TRIM(p_notes), ''), ''),
    NULLIF(TRIM(COALESCE(p_password, '')), ''),
    COALESCE(p_board, 'Uprising'),
    COALESCE(p_expansions, '{}'::text[]),
    CASE WHEN p_mode = 'live' THEN 'live' ELSE 'async' END,
    v_uid, ARRAY[v_uid]::uuid[], ARRAY[v_ign]::text[],
    now() + make_interval(mins => GREATEST(COALESCE(p_expires_minutes, 60), 1))
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'ign', v_ign);
END;
$$;

CREATE OR REPLACE FUNCTION public.lfg_join_seat(p_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ign text;
  v_row public.active_async_matches%ROWTYPE;
  v_seats integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not signed in');
  END IF;
  v_ign := public.lfg_my_ign();
  IF v_ign IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You must claim your in-game name to join a lobby.');
  END IF;

  SELECT * INTO v_row FROM public.active_async_matches WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Lobby not found');
  END IF;
  IF v_row.status NOT IN ('searching', 'pending_creation') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This lobby is no longer open');
  END IF;
  IF v_uid = ANY(COALESCE(v_row.web_player_ids, '{}'::uuid[])) THEN
    RETURN jsonb_build_object('ok', true, 'id', p_id);
  END IF;

  v_seats := COALESCE(array_length(v_row.player_ids, 1), 0)
           + COALESCE(array_length(v_row.guest_players, 1), 0)
           + COALESCE(array_length(v_row.web_player_names, 1), 0);
  IF v_seats >= 4 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This lobby is full');
  END IF;

  UPDATE public.active_async_matches
     SET web_player_ids = COALESCE(web_player_ids, '{}'::uuid[]) || v_uid,
         web_player_names = COALESCE(web_player_names, '{}'::text[]) || v_ign
   WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'id', p_id, 'ign', v_ign);
END;
$$;

CREATE OR REPLACE FUNCTION public.lfg_start_game(p_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.active_async_matches%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not signed in');
  END IF;
  SELECT * INTO v_row FROM public.active_async_matches WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Lobby not found');
  END IF;
  IF v_row.web_host_id IS DISTINCT FROM v_uid
     AND NOT (v_uid = ANY(COALESCE(v_row.web_player_ids, '{}'::uuid[]))) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only seated players can start this game');
  END IF;

  UPDATE public.active_async_matches SET status = 'started' WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.lfg_my_ign() TO authenticated;
GRANT EXECUTE ON FUNCTION public.lfg_create_lobby(text, text, text[], text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lfg_join_seat(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lfg_start_game(bigint) TO authenticated;
