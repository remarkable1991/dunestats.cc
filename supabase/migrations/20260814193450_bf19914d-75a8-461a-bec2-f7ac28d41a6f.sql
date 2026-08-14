ALTER TABLE public.tournament_matches ADD COLUMN IF NOT EXISTS is_backup boolean NOT NULL DEFAULT false;

GRANT SELECT ON public.tournament_match_schedules TO anon, authenticated;
GRANT ALL ON public.tournament_match_schedules TO service_role;

CREATE OR REPLACE FUNCTION public.mark_async_game_started(
  p_tournament_num integer,
  p_round_type text,
  p_table_identifier text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_allowed boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  SELECT public.has_role(v_uid, 'admin') INTO v_allowed;

  IF NOT v_allowed THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.tournament_matches tm
      JOIN public.player_ratings pr
        ON lower(btrim(pr.player_key)) = lower(btrim(tm.player_name))
      WHERE tm.tournament_num = p_tournament_num
        AND tm.round_type = p_round_type
        AND tm.table_identifier = p_table_identifier
        AND pr.claimed_by = v_uid
    ) INTO v_allowed;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Not allowed to start this game';
  END IF;

  UPDATE public.tournament_match_schedules
     SET status = 'ongoing',
         confirmed_timestamp = now(),
         updated_at = now()
   WHERE tournament_num = p_tournament_num
     AND round_type = p_round_type
     AND table_identifier = p_table_identifier;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_async_game_started(integer, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_async_game_started(integer, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_table_roster(
  p_tournament_num integer,
  p_round_type text,
  p_table_identifier text,
  p_players jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_names text[] := ARRAY[]::text[];
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_players)
  LOOP
    UPDATE public.tournament_matches
       SET player_name = v_item->>'player_name',
           discord_username = NULLIF(v_item->>'discord_username', ''),
           is_backup = COALESCE((v_item->>'is_backup')::boolean, false),
           updated_at = now()
     WHERE id = (v_item->>'id')::uuid
       AND tournament_num = p_tournament_num;
    v_names := array_append(v_names, v_item->>'player_name');
  END LOOP;

  UPDATE public.tournament_match_schedules
     SET player_names = v_names,
         updated_at = now()
   WHERE tournament_num = p_tournament_num
     AND round_type = p_round_type
     AND table_identifier = p_table_identifier;

  RETURN jsonb_build_object('ok', true, 'players', v_names);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_table_roster(integer, text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_set_table_roster(integer, text, text, jsonb) TO authenticated;