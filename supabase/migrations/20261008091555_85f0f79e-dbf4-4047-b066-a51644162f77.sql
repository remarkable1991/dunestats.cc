CREATE OR REPLACE FUNCTION public.lfg_update_lobby(p_id bigint, p_mode text, p_board text, p_expansions text[], p_notes text, p_password text, p_expires_minutes integer, p_guest_players text[] DEFAULT '{}'::text[], p_remove_web_ids text[] DEFAULT '{}'::text[], p_remove_discord_ids text[] DEFAULT '{}'::text[])
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.active_async_matches%ROWTYPE;
  v_names text[] := '{}';
  v_ids uuid[] := '{}';
  v_guests text[] := '{}';
  v_g text;
  i integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You must be signed in.');
  END IF;
  SELECT * INTO v_row FROM public.active_async_matches WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Lobby not found.');
  END IF;
  IF NOT (
    v_row.web_host_id = v_uid
    OR v_row.host_id = v_uid::text
    OR EXISTS (SELECT 1 FROM public.player_discord_map m WHERE m.claimed_by = v_uid AND m.discord_user_id IS NOT NULL AND m.discord_user_id = v_row.host_id)
    OR public.has_role(v_uid, 'admin'::public.app_role)
    OR public.has_role(v_uid, 'lfg_admin'::public.app_role)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only the host or an LFG admin can edit this lobby.');
  END IF;

  FOR i IN 1 .. COALESCE(array_length(v_row.web_player_ids, 1), 0) LOOP
    IF v_row.web_player_ids[i]::text = ANY (COALESCE(p_remove_web_ids, '{}'::text[]))
       AND (v_row.web_host_id IS NULL OR v_row.web_player_ids[i] <> v_row.web_host_id) THEN
      CONTINUE;
    END IF;
    v_ids := v_ids || v_row.web_player_ids[i];
    v_names := v_names || COALESCE(v_row.web_player_names[i], '');
  END LOOP;

  FOREACH v_g IN ARRAY COALESCE(p_guest_players, '{}'::text[]) LOOP
    IF btrim(v_g) <> '' THEN v_guests := v_guests || btrim(v_g); END IF;
  END LOOP;

  UPDATE public.active_async_matches
  SET mode = COALESCE(NULLIF(lower(btrim(p_mode)), ''), mode),
      board_type = COALESCE(NULLIF(btrim(p_board), ''), board_type),
      expansions = COALESCE(p_expansions, expansions),
      message_text = COALESCE(p_notes, message_text),
      lobby_password = NULLIF(btrim(COALESCE(p_password, '')), ''),
      expires_at = CASE WHEN p_expires_minutes IS NULL OR p_expires_minutes <= 0 THEN expires_at
                        ELSE now() + make_interval(mins => p_expires_minutes) END,
      guest_players = v_guests,
      web_player_ids = v_ids,
      web_player_names = v_names,
      player_ids = (
        SELECT COALESCE(array_agg(x), '{}'::text[])
        FROM unnest(COALESCE(player_ids, '{}'::text[])) AS x
        WHERE NOT (x = ANY (COALESCE(p_remove_discord_ids, '{}'::text[])) AND x IS DISTINCT FROM host_id)
      )
  WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.lfg_add_guest(p_id bigint, p_name text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.active_async_matches%ROWTYPE;
  v_name text := btrim(coalesce(p_name, ''));
  v_total int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You must be signed in.');
  END IF;
  IF v_name = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Enter a player name.');
  END IF;
  SELECT * INTO v_row FROM public.active_async_matches WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Lobby not found.');
  END IF;
  IF v_row.status NOT IN ('searching', 'pending_creation') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This lobby is no longer open.');
  END IF;
  IF NOT (public.lfg_is_member(v_row, v_uid)
          OR public.has_role(v_uid, 'admin'::public.app_role)
          OR public.has_role(v_uid, 'lfg_admin'::public.app_role)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only players in this lobby or LFG admins can add someone.');
  END IF;
  v_total := coalesce(array_length(v_row.web_player_names, 1), 0)
           + coalesce(array_length(v_row.player_ids, 1), 0)
           + coalesce(array_length(v_row.guest_players, 1), 0);
  IF v_total >= 4 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This lobby is already full.');
  END IF;
  UPDATE public.active_async_matches
     SET guest_players = coalesce(guest_players, ARRAY[]::text[]) || v_name
   WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END;
$function$;