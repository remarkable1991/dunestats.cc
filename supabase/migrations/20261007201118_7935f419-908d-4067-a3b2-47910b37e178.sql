DROP POLICY IF EXISTS "lfg_public_read" ON public.active_async_matches;
CREATE POLICY "lfg_public_read" ON public.active_async_matches
  FOR SELECT TO anon, authenticated
  USING (
    COALESCE(is_league, false) = false
    OR public.has_role(auth.uid(), 'lfg_admin')
    OR public.has_role(auth.uid(), 'admin')
  );

DROP FUNCTION IF EXISTS public.lfg_create_lobby(text, text, text[], text, text, integer, text[]);

CREATE OR REPLACE FUNCTION public.lfg_create_lobby(
  p_mode text, p_board text, p_expansions text[], p_notes text, p_password text,
  p_expires_minutes integer, p_guest_players text[] DEFAULT '{}'::text[], p_is_league boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ign text;
  v_id bigint;
  v_guest_players text[];
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not signed in');
  END IF;
  v_ign := public.lfg_my_ign();
  IF v_ign IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You must claim your in-game name to create a lobby.');
  END IF;
  IF COALESCE(p_is_league, false)
     AND NOT (public.has_role(v_uid, 'lfg_admin') OR public.has_role(v_uid, 'admin')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only LFG admins can create league matches.');
  END IF;

  SELECT COALESCE(array_agg(trimmed_name ORDER BY ordinal), '{}'::text[]) INTO v_guest_players
  FROM (
    SELECT btrim(guest_name) AS trimmed_name, ordinal
    FROM unnest(COALESCE(p_guest_players, '{}'::text[])) WITH ORDINALITY AS guests(guest_name, ordinal)
    WHERE btrim(guest_name) <> ''
  ) AS cleaned;
  IF COALESCE(array_length(v_guest_players, 1), 0) > 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You can add up to 2 guest players.');
  END IF;

  INSERT INTO public.active_async_matches (
    message_id, channel_id, guild_id, host_id, status, message_text,
    lobby_password, board_type, expansions, mode,
    web_host_id, web_player_ids, web_player_names, guest_players,
    expires_at, is_league, league_status
  ) VALUES (
    '', '', '', v_uid::text, 'pending_creation', COALESCE(NULLIF(TRIM(p_notes), ''), ''),
    NULLIF(TRIM(COALESCE(p_password, '')), ''),
    COALESCE(p_board, 'Uprising'), COALESCE(p_expansions, '{}'::text[]),
    CASE WHEN p_mode = 'live' THEN 'live' ELSE 'async' END,
    v_uid, ARRAY[v_uid]::uuid[], ARRAY[v_ign]::text[], v_guest_players,
    now() + make_interval(mins => GREATEST(COALESCE(p_expires_minutes, 60), 1)),
    COALESCE(p_is_league, false),
    CASE WHEN COALESCE(p_is_league, false) THEN 'open' ELSE NULL END
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'ign', v_ign);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.lfg_create_lobby(text, text, text[], text, text, integer, text[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lfg_create_lobby(text, text, text[], text, text, integer, text[], boolean) TO authenticated, service_role;