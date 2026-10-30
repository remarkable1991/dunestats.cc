ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS show_all_rating_tracks boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS league_ratings_pilot_read ON public.player_league_ratings;
GRANT SELECT ON public.player_league_ratings TO anon, authenticated;
CREATE POLICY league_ratings_public_read ON public.player_league_ratings FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS league_delta_no_browser_access ON public.league_match_rating_deltas;
GRANT SELECT ON public.league_match_rating_deltas TO anon, authenticated;
CREATE POLICY league_delta_public_read ON public.league_match_rating_deltas FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.revert_league_deltas_for_game(p_game uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_delta record; n int := 0;
BEGIN
  IF p_game IS NULL THEN RETURN 0; END IF;
  IF EXISTS(SELECT 1 FROM active_async_matches l JOIN player_league_ratings r ON r.season=coalesce(l.season_num,l.season_id)
     JOIN game_results gr ON gr.game_id=p_game AND r.player_key=lower(btrim(gr.player_name))
     WHERE l.linked_game_id=p_game AND l.is_league AND l.league_status IN ('confirmed','rated') AND r.games_played>0
       AND NOT EXISTS(SELECT 1 FROM league_match_rating_deltas d WHERE d.game_id=p_game AND d.player_key=r.player_key AND d.season=r.season)) THEN
    RAISE EXCEPTION 'League Elo was applied without per-match deltas. No changes were made';
  END IF;
  FOR v_delta IN DELETE FROM league_match_rating_deltas WHERE game_id=p_game RETURNING * LOOP
    UPDATE player_league_ratings SET elo=elo-v_delta.elo_delta, games_played=greatest(0,games_played-1),
      wins=greatest(0,wins-CASE WHEN v_delta.won THEN 1 ELSE 0 END), updated_at=now()
     WHERE player_key=v_delta.player_key AND season=v_delta.season;
    n := n+1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.revert_league_deltas_for_game(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revert_league_deltas_for_game(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_unlink_lobby(p_lobby_id bigint, p_mode text, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_lobby active_async_matches%ROWTYPE; v_game uuid; v_n int;
BEGIN
  IF p_actor IS NULL OR NOT (has_role(p_actor,'admin') OR has_role(p_actor,'lfg_admin')) THEN RAISE EXCEPTION 'LFG admins only'; END IF;
  IF p_mode NOT IN ('delete','league_pending','casual') THEN RAISE EXCEPTION 'Unknown unlink option'; END IF;
  IF p_mode='delete' THEN
    RETURN admin_revert_match_and_sp(p_lobby_id, NULL, true, true, p_actor);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('admin-lobby-revert'));
  SELECT * INTO v_lobby FROM active_async_matches WHERE id=p_lobby_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lobby not found'; END IF;
  v_game := v_lobby.linked_game_id;
  v_n := revert_league_deltas_for_game(v_game);
  IF v_game IS NOT NULL THEN UPDATE games SET is_league=false WHERE id=v_game; END IF;
  IF p_mode='league_pending' THEN
    UPDATE active_async_matches SET linked_game_id=NULL, status='started', is_league=true, league_status=NULL WHERE id=p_lobby_id;
  ELSE
    UPDATE active_async_matches SET status='started', is_league=false, league_status='casual' WHERE id=p_lobby_id;
  END IF;
  INSERT INTO lfg_lobby_events(lobby_id,actor_name,kind,detail) VALUES(p_lobby_id,p_actor::text,'admin_unlink',
    CASE WHEN p_mode='league_pending' THEN 'Unlinked result; back to League, waiting for screenshot' ELSE 'Converted to casual game' END
    || '; League Elo entries reverted: '||v_n);
  RETURN jsonb_build_object('ok',true,'league_deltas_reverted',v_n,'game_id',v_game);
END $$;
REVOKE ALL ON FUNCTION public.admin_unlink_lobby(bigint,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unlink_lobby(bigint,text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_promote_lobby_league(p_lobby_id bigint, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
BEGIN
  IF p_actor IS NULL OR NOT (has_role(p_actor,'admin') OR has_role(p_actor,'lfg_admin')) THEN RAISE EXCEPTION 'LFG admins only'; END IF;
  UPDATE active_async_matches SET is_league=true, league_status=NULL, linked_game_id=NULL, status='started'
   WHERE id=p_lobby_id AND league_status='casual';
  IF NOT FOUND THEN RAISE EXCEPTION 'Only casual-converted lobbies can be promoted'; END IF;
  INSERT INTO lfg_lobby_events(lobby_id,actor_name,kind,detail) VALUES(p_lobby_id,p_actor::text,'admin_promote','Promoted back to League; waiting for screenshot');
  RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.admin_promote_lobby_league(bigint,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_promote_lobby_league(bigint,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.lfg_link_game(p_id bigint, p_public_match_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_row active_async_matches%ROWTYPE; v_game uuid; v_admin boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Sign in to link a result'); END IF;
  SELECT * INTO v_row FROM active_async_matches WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','Lobby not found'); END IF;
  v_admin := has_role(v_uid,'admin') OR has_role(v_uid,'lfg_admin');
  IF NOT v_admin THEN
    IF v_row.linked_game_id IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'error','This lobby already has a result'); END IF;
    IF v_row.league_status='casual' THEN RETURN jsonb_build_object('ok',false,'error','This lobby was converted to a casual game'); END IF;
    IF v_row.status IN ('cancelled','expired') THEN RETURN jsonb_build_object('ok',false,'error','This lobby is closed'); END IF;
  END IF;
  SELECT id INTO v_game FROM games WHERE upper(public_match_id)=upper(trim(p_public_match_id)) OR id::text=trim(p_public_match_id) LIMIT 1;
  IF v_game IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Match not found'); END IF;
  IF EXISTS(SELECT 1 FROM active_async_matches WHERE linked_game_id=v_game AND id<>p_id) THEN RETURN jsonb_build_object('ok',false,'error','This match is already linked to another lobby'); END IF;
  UPDATE active_async_matches SET linked_game_id=v_game,
    league_status=CASE WHEN is_league THEN 'reported' ELSE league_status END,
    status=CASE WHEN status='searching' THEN 'started' ELSE status END WHERE id=p_id;
  IF v_row.is_league THEN UPDATE games SET is_league=true WHERE id=v_game; END IF;
  RETURN jsonb_build_object('ok',true,'game_id',v_game);
END $$;

-- Save confirmed Discord <-> IGN pairs from a reported lobby; never overwrites existing mappings.
CREATE OR REPLACE FUNCTION public.lfg_record_result_identities(p_lobby_id bigint, p_pairs jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_lobby active_async_matches%ROWTYPE; p jsonb; v_id text; v_name text; v_key text; n int := 0;
BEGIN
  SELECT * INTO v_lobby FROM active_async_matches WHERE id=p_lobby_id;
  IF NOT FOUND OR v_lobby.linked_game_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Lobby has no linked result'); END IF;
  FOR p IN SELECT * FROM jsonb_array_elements(coalesce(p_pairs,'[]'::jsonb)) LOOP
    v_id := btrim(p->>'discord_user_id'); v_name := btrim(p->>'player_name'); v_key := lower(v_name);
    CONTINUE WHEN v_id IS NULL OR v_id='' OR v_name IS NULL OR v_name='';
    CONTINUE WHEN NOT (v_id = ANY(coalesce(v_lobby.player_ids,'{}')) OR v_id = v_lobby.host_id);
    CONTINUE WHEN NOT EXISTS(SELECT 1 FROM game_results WHERE game_id=v_lobby.linked_game_id AND lower(btrim(player_name))=v_key);
    CONTINUE WHEN EXISTS(SELECT 1 FROM player_discord_map WHERE discord_user_id=v_id AND player_key IS NOT NULL AND btrim(player_key)<>'');
    CONTINUE WHEN EXISTS(SELECT 1 FROM player_discord_map WHERE lower(btrim(player_key))=v_key AND discord_user_id IS NOT NULL AND discord_user_id<>v_id);
    IF EXISTS(SELECT 1 FROM player_discord_map WHERE lower(btrim(player_key))=v_key) THEN
      UPDATE player_discord_map SET discord_user_id=v_id, updated_at=now() WHERE lower(btrim(player_key))=v_key;
    ELSIF EXISTS(SELECT 1 FROM player_discord_map WHERE discord_user_id=v_id) THEN
      UPDATE player_discord_map SET player_key=v_key, display_name=coalesce(display_name,v_name), updated_at=now() WHERE discord_user_id=v_id;
    ELSE
      INSERT INTO player_discord_map(player_key,display_name,discord_user_id,discord_username,source)
      SELECT v_key, v_name, v_id, m.discord_username, 'lobby_result'
      FROM (SELECT (SELECT discord_username FROM discord_guild_members WHERE discord_user_id=v_id) AS discord_username) m
      WHERE NOT EXISTS(SELECT 1 FROM player_discord_map x WHERE m.discord_username IS NOT NULL AND lower(btrim(x.discord_username))=lower(btrim(m.discord_username)));
    END IF;
    n := n+1;
  END LOOP;
  RETURN jsonb_build_object('ok',true,'mapped',n);
END $$;
REVOKE ALL ON FUNCTION public.lfg_record_result_identities(bigint,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lfg_record_result_identities(bigint,jsonb) TO service_role;

INSERT INTO public.player_discord_map(player_key,display_name,discord_user_id,discord_username,source)
SELECT 'mechanicsbeatstheme','MechanicsBeatsTheme','1055158099436118087','danial5356','admin'
WHERE NOT EXISTS(SELECT 1 FROM public.player_discord_map WHERE discord_user_id='1055158099436118087' OR lower(btrim(player_key))='mechanicsbeatstheme' OR lower(btrim(discord_username))='danial5356');