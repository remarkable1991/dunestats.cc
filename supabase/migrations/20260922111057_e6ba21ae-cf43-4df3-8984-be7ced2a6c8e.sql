CREATE OR REPLACE FUNCTION public.lfg_add_guest(p_id bigint, p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  IF v_row.status <> 'searching' AND v_row.status <> 'pending_creation' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This lobby is no longer open.');
  END IF;
  IF NOT (v_uid = ANY(coalesce(v_row.web_player_ids, ARRAY[]::uuid[])) OR v_uid = v_row.web_host_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only players in this lobby can add someone.');
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
$$;

REVOKE ALL ON FUNCTION public.lfg_add_guest(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lfg_add_guest(bigint, text) TO authenticated, service_role;