CREATE OR REPLACE FUNCTION public.lfg_discord_alert_preference(p_enabled boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_map public.player_discord_map%ROWTYPE; v_count integer; v_guild boolean; v_enabled boolean;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'Sign in to manage Discord alerts'; END IF;
 SELECT count(DISTINCT discord_user_id) INTO v_count FROM public.player_discord_map WHERE claimed_by=v_user AND nullif(trim(discord_user_id),'') IS NOT NULL;
 IF v_count <> 1 THEN
  IF p_enabled IS NOT NULL THEN RAISE EXCEPTION 'Connect one verified Discord account before changing Discord alerts'; END IF;
  RETURN jsonb_build_object('linked',false,'ambiguous',v_count>1,'username',NULL,'map_role',NULL,'guild_role',NULL);
 END IF;
 SELECT * INTO v_map FROM public.player_discord_map WHERE claimed_by=v_user AND nullif(trim(discord_user_id),'') IS NOT NULL ORDER BY updated_at DESC,id DESC LIMIT 1 FOR UPDATE;
 SELECT has_league_lfg_role INTO v_guild FROM public.discord_guild_members WHERE discord_user_id=v_map.discord_user_id;
 v_enabled := coalesce(v_map.has_league_lfg_role,v_guild,false);
 IF p_enabled IS NOT NULL THEN
  UPDATE public.player_discord_map SET has_league_lfg_role=p_enabled,updated_at=now() WHERE claimed_by=v_user AND discord_user_id=v_map.discord_user_id;
  INSERT INTO public.lfg_alert_preferences(user_id,discord_openings) VALUES(v_user,p_enabled)
  ON CONFLICT(user_id) DO UPDATE SET discord_openings=excluded.discord_openings,updated_at=now();
  v_map.has_league_lfg_role:=p_enabled;
 END IF;
 RETURN jsonb_build_object('linked',true,'ambiguous',false,'username',coalesce(v_map.discord_username,v_map.username),'map_role',v_map.has_league_lfg_role,'guild_role',v_guild);
END;
$$;
REVOKE ALL ON FUNCTION public.lfg_discord_alert_preference(boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.lfg_discord_alert_preference(boolean) TO authenticated;
COMMENT ON FUNCTION public.lfg_discord_alert_preference(boolean) IS 'Own verified Discord opening-alert preference. Mapping is desired role state; guild directory is observed state. No website authorization is granted.';