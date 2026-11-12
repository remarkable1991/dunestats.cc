CREATE OR REPLACE FUNCTION public.lfg_admin_map_discord(p_discord_user_id text, p_discord_username text, p_player_key text, p_display_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_key text := lower(btrim(p_player_key));
  v_owner uuid;
  v_target bigint;
  v_existing public.player_discord_map%ROWTYPE;
  v_handle text := nullif(btrim(p_discord_username), '');
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'lfg_admin')) THEN
    RAISE EXCEPTION 'LFG admins only';
  END IF;
  IF v_key IN ('s4ngluten', 'sangluten') OR EXISTS (
    SELECT 1 FROM public.player_discord_map
    WHERE discord_user_id = btrim(p_discord_user_id) AND player_key IN ('s4ngluten', 'sangluten')
  ) THEN
    RAISE EXCEPTION 'This protected mapping requires separate explicit approval';
  END IF;
  IF v_key = '' OR coalesce(btrim(p_discord_user_id), '') !~ '^[0-9]{6,25}$' THEN
    RAISE EXCEPTION 'Valid Discord ID and player name required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('discord-map'));

  IF NOT EXISTS (SELECT 1 FROM public.player_ratings WHERE player_key = v_key) THEN
    RAISE EXCEPTION 'Player must exist on the leaderboard';
  END IF;
  IF (SELECT count(DISTINCT claimed_by) FROM public.player_ratings WHERE player_key = v_key) > 1 THEN
    RAISE EXCEPTION 'Conflicting claimed accounts require main-admin review';
  END IF;
  SELECT claimed_by INTO v_owner
  FROM public.player_ratings
  WHERE player_key = v_key AND claimed_by IS NOT NULL
  LIMIT 1;

  SELECT * INTO v_existing
  FROM public.player_discord_map
  WHERE discord_user_id = btrim(p_discord_user_id)
  ORDER BY id
  LIMIT 1
  FOR UPDATE;

  SELECT id INTO v_target
  FROM public.player_discord_map
  WHERE player_key = v_key
  ORDER BY id
  LIMIT 1
  FOR UPDATE;

  -- Never merge two different Discord identities or two separately claimed IGNs.
  IF EXISTS (
    SELECT 1 FROM public.player_discord_map
    WHERE player_key = v_key
      AND (
        (discord_user_id IS NOT NULL AND discord_user_id <> btrim(p_discord_user_id))
        OR (claimed_by IS NOT NULL AND claimed_by IS DISTINCT FROM v_owner)
      )
  ) THEN
    RAISE EXCEPTION 'An existing link conflicts. Review the accounts before connecting them';
  END IF;
  IF v_existing.id IS NOT NULL AND v_target IS NOT NULL AND v_target <> v_existing.id THEN
    RAISE EXCEPTION 'The target name has a separate mapping. Consolidate those records before moving this Discord link';
  END IF;

  IF v_existing.id IS NOT NULL THEN
    UPDATE public.player_discord_map
    SET player_key = v_key,
        claimed_by = coalesce(v_owner, v_existing.claimed_by),
        discord_username = coalesce(v_handle, discord_username),
        display_name = coalesce(nullif(btrim(p_display_name), ''), display_name),
        source = 'lfg_admin',
        updated_at = now()
    WHERE id = v_existing.id;

    IF v_existing.player_key IS DISTINCT FROM v_key THEN
      INSERT INTO public.player_name_aliases(old_name, canonical_name, created_by)
      VALUES (v_existing.player_key, v_key, v_uid)
      ON CONFLICT (lower(old_name), lower(canonical_name)) DO NOTHING;
    END IF;
  ELSIF v_target IS NULL THEN
    INSERT INTO public.player_discord_map(player_key, display_name, claimed_by, discord_user_id, discord_username, source)
    VALUES (v_key, coalesce(nullif(btrim(p_display_name), ''), p_player_key), v_owner, btrim(p_discord_user_id), v_handle, 'lfg_admin');
  ELSE
    UPDATE public.player_discord_map
    SET claimed_by = coalesce(v_owner, claimed_by),
        discord_user_id = btrim(p_discord_user_id),
        discord_username = coalesce(v_handle, discord_username),
        display_name = coalesce(nullif(btrim(p_display_name), ''), display_name),
        source = 'lfg_admin',
        updated_at = now()
    WHERE id = v_target;
  END IF;

  -- Do not mirror a manually confirmed handle onto profiles: the legacy profile trigger can auto-claim unrelated names.
  RETURN jsonb_build_object('ok', true, 'claimed_by', v_owner, 'previous_player_key', v_existing.player_key);
END
$function$;