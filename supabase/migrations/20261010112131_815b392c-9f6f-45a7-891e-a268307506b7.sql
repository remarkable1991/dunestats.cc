ALTER TABLE public.matchmaking_queue ALTER COLUMN discord_user_id DROP NOT NULL;
GRANT SELECT ON public.matchmaking_queue TO authenticated;
GRANT SELECT ON public.league_presets TO authenticated;
GRANT ALL ON public.matchmaking_queue TO service_role;
GRANT ALL ON public.league_presets TO service_role;
ALTER TABLE public.matchmaking_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_presets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "LFG admins view queue" ON public.matchmaking_queue FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'lfg_admin'));
CREATE POLICY "LFG admins view presets" ON public.league_presets FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'lfg_admin'));

CREATE OR REPLACE FUNCTION public.mm_join_queue(p_mode text, p_duration_minutes integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_ign text; v_key text; v_discord text; v_allowed int[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF NOT (has_role(v_uid,'admin') OR has_role(v_uid,'lfg_admin')) THEN RAISE EXCEPTION 'Pilot is limited to LFG admins'; END IF;
  IF p_mode NOT IN ('live','async') THEN RAISE EXCEPTION 'Invalid mode'; END IF;
  v_allowed := CASE WHEN p_mode='live' THEN ARRAY[5,15,30,45,60] ELSE ARRAY[60,120,360,720] END;
  IF NOT (p_duration_minutes = ANY(v_allowed)) THEN RAISE EXCEPTION 'Invalid duration'; END IF;
  v_ign := lfg_my_ign();
  IF v_ign IS NULL OR btrim(v_ign)='' THEN RAISE EXCEPTION 'Claim your in-game name first'; END IF;
  v_key := lower(btrim(v_ign));
  SELECT discord_user_id INTO v_discord FROM player_discord_map
   WHERE (claimed_by = v_uid OR lower(player_key) = v_key) AND discord_user_id IS NOT NULL
   ORDER BY (claimed_by = v_uid) DESC NULLS LAST LIMIT 1;
  -- one seat per person per mode, whichever way they joined
  DELETE FROM matchmaking_queue WHERE mode = p_mode
    AND (user_id = v_uid OR lower(player_key) = v_key OR (v_discord IS NOT NULL AND discord_user_id = v_discord));
  INSERT INTO matchmaking_queue(mode, user_id, player_key, display_name, discord_user_id, duration_minutes, joined_at, expires_at)
  VALUES (p_mode, v_uid, v_key, v_ign, v_discord, p_duration_minutes, now(), now() + make_interval(mins => p_duration_minutes));
  RETURN jsonb_build_object('ok', true, 'linked_discord', v_discord IS NOT NULL);
END $$;

CREATE OR REPLACE FUNCTION public.mm_leave_queue(p_mode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_key text := lower(btrim(coalesce(lfg_my_ign(),'')));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  DELETE FROM matchmaking_queue WHERE mode = p_mode AND (user_id = v_uid OR (v_key <> '' AND lower(player_key) = v_key));
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE EXECUTE ON FUNCTION public.mm_join_queue(text,integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.mm_leave_queue(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.mm_join_queue(text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mm_leave_queue(text) TO authenticated;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.matchmaking_queue;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;