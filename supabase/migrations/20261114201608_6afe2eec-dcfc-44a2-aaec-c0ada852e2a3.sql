DO $$
DECLARE g uuid := 'b040b108-1ce8-41b8-abe6-d3745c8a8ba2';
BEGIN
-- revert old version/overall deltas on established players
UPDATE player_ratings SET elo=elo-16.58+17.52 WHERE player_key='sugarp0va' AND game_version='uprising';
UPDATE player_ratings SET elo=elo-16.58+17.60 WHERE player_key='sugarp0va' AND game_version='overall';
UPDATE player_ratings SET elo=elo+2.57-12.39, top2=top2-1 WHERE player_key='furidw' AND game_version='uprising';
UPDATE player_ratings SET elo=elo+2.68-12.44, top2=top2-1 WHERE player_key='furidw' AND game_version='overall';
UPDATE player_ratings SET elo=elo+9.28-8.47 WHERE player_key='rexthanos26' AND game_version='uprising';
UPDATE player_ratings SET elo=elo+9.29-8.42 WHERE player_key='rexthanos26' AND game_version='overall';
UPDATE player_ratings SET elo=elo+3.34, games_played=games_played+1, top2=top2+1, total_points=total_points+10, updated_at=now() WHERE player_key='spellcastermax' AND game_version='uprising';
UPDATE player_ratings SET elo=elo+3.26, games_played=games_played+1, top2=top2+1, total_points=total_points+10, updated_at=now() WHERE player_key='spellcastermax' AND game_version='overall';
DELETE FROM player_ratings WHERE player_key='spellcaster max';

UPDATE game_results SET placement=2, player_name='Spellcastermax', elo_delta=3.34, elo_delta_overall=3.26 WHERE game_id=g AND player_name='Spellcaster Max';
UPDATE game_results SET placement=3, elo_delta=-12.39, elo_delta_overall=-12.44 WHERE game_id=g AND player_name='furiDW';
UPDATE game_results SET elo_delta=17.52, elo_delta_overall=17.60 WHERE game_id=g AND player_name='sugarp0va';
UPDATE game_results SET elo_delta=-8.47, elo_delta_overall=-8.42 WHERE game_id=g AND player_name='Rexthanos26';
UPDATE sandbox_game_results SET player_name='Spellcastermax' WHERE game_id=g AND player_name='Spellcaster Max';
DELETE FROM sandbox_player_ratings WHERE player_key='spellcaster max';

-- League season 1
UPDATE player_league_ratings SET elo=elo-16.47+17.06 WHERE player_key='sugarp0va' AND season=1;
UPDATE player_league_ratings SET elo=elo+1.63-11.76 WHERE player_key='furidw' AND season=1;
UPDATE player_league_ratings SET elo=elo+9.56-9.05 WHERE player_key='rexthanos26' AND season=1;
UPDATE player_league_ratings SET elo=elo+3.75, games_played=games_played+1, updated_at=now() WHERE player_key='spellcastermax' AND season=1;
DELETE FROM player_league_ratings WHERE player_key='spellcaster max';
UPDATE league_match_rating_deltas SET elo_delta=17.06 WHERE game_id=g AND player_key='sugarp0va';
UPDATE league_match_rating_deltas SET elo_delta=-11.76 WHERE game_id=g AND player_key='furidw';
UPDATE league_match_rating_deltas SET elo_delta=-9.05 WHERE game_id=g AND player_key='rexthanos26';
UPDATE league_match_rating_deltas SET player_key='spellcastermax', elo_delta=3.75 WHERE game_id=g AND player_key='spellcaster max';

-- SP: move participation, drop duplicate daily (already earned today)
DELETE FROM sp_events WHERE player_key='spellcaster max' AND action_type='daily_first_message';
UPDATE sp_events SET player_key='spellcastermax' WHERE player_key='spellcaster max';
UPDATE player_sp SET lifetime_sp=lifetime_sp+20, seasonal_sp=seasonal_sp+20, updated_at=now() WHERE player_key='spellcastermax';
UPDATE player_season_sp SET seasonal_sp=seasonal_sp+20, updated_at=now() WHERE player_key='spellcastermax' AND season_id=1;
DELETE FROM player_sp WHERE player_key='spellcaster max';
DELETE FROM player_season_sp WHERE player_key='spellcaster max';

DELETE FROM player_name_aliases WHERE lower(old_name)='spellcastermax' AND canonical_name='Spellcaster Max';
UPDATE player_name_aliases SET canonical_name='Spellcastermax' WHERE old_name='Spellcaster Max';
UPDATE match_reports SET status='resolved', updated_at=now() WHERE id=15;
END $$;

CREATE OR REPLACE FUNCTION public.lfg_record_result_identities(p_lobby_id bigint, p_pairs jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_lobby active_async_matches%ROWTYPE; p jsonb; v_id text; v_name text; v_key text; v_seat text; v_old text;
  n int := 0; changes jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_lobby FROM active_async_matches WHERE id=p_lobby_id FOR UPDATE;
  IF NOT FOUND OR v_lobby.linked_game_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Lobby has no linked result'); END IF;
  FOR p IN SELECT * FROM jsonb_array_elements(coalesce(p_pairs,'[]'::jsonb)) LOOP
    v_id := nullif(btrim(coalesce(p->>'discord_user_id','')),''); v_name := btrim(p->>'player_name'); v_key := lower(v_name);
    v_seat := nullif(btrim(coalesce(p->>'seat_name','')),'');
    CONTINUE WHEN v_name IS NULL OR v_name='';
    CONTINUE WHEN NOT EXISTS(SELECT 1 FROM game_results WHERE game_id=v_lobby.linked_game_id AND lower(btrim(player_name))=v_key);
    -- Spacing-only differences are never a name change
    CONTINUE WHEN v_seat IS NOT NULL AND lower(v_seat)<>v_key AND regexp_replace(lower(v_seat),'\s','','g')=regexp_replace(v_key,'\s','','g');

    IF v_seat IS NOT NULL AND lower(v_seat)<>v_key THEN
      IF EXISTS(SELECT 1 FROM unnest(coalesce(v_lobby.web_player_names,'{}')) x WHERE lower(btrim(x))=lower(v_seat))
         OR EXISTS(SELECT 1 FROM unnest(coalesce(v_lobby.guest_players,'{}')) x WHERE lower(btrim(x))=lower(v_seat)) THEN
        UPDATE active_async_matches SET
          web_player_names = (SELECT array_agg(CASE WHEN lower(btrim(x))=lower(v_seat) THEN v_name ELSE x END ORDER BY o) FROM unnest(web_player_names) WITH ORDINALITY t(x,o)),
          guest_players = (SELECT array_agg(CASE WHEN lower(btrim(x))=lower(v_seat) THEN v_name ELSE x END ORDER BY o) FROM unnest(guest_players) WITH ORDINALITY t(x,o)),
          expected_player_keys = (SELECT array_agg(CASE WHEN lower(btrim(x))=lower(v_seat) THEN v_key ELSE x END ORDER BY o) FROM unnest(expected_player_keys) WITH ORDINALITY t(x,o))
        WHERE id=p_lobby_id;
        changes := changes || jsonb_build_object('kind','seat_renamed','from',v_seat,'to',v_name);
      END IF;
      IF NOT EXISTS(SELECT 1 FROM player_name_aliases WHERE lower(old_name)=lower(v_seat) AND lower(canonical_name)=v_key) THEN
        INSERT INTO player_name_aliases(old_name, canonical_name) VALUES (v_seat, v_name);
        changes := changes || jsonb_build_object('kind','alias_added','from',v_seat,'to',v_name);
      END IF;
    END IF;

    CONTINUE WHEN v_id IS NULL;
    CONTINUE WHEN NOT (v_id = ANY(coalesce(v_lobby.player_ids,'{}')) OR v_id = v_lobby.host_id);
    CONTINUE WHEN EXISTS(SELECT 1 FROM player_discord_map WHERE lower(btrim(player_key))=v_key AND discord_user_id IS NOT NULL AND discord_user_id<>v_id);
    SELECT player_key INTO v_old FROM player_discord_map WHERE discord_user_id=v_id AND coalesce(btrim(player_key),'')<>'' LIMIT 1;
    IF v_old IS NOT NULL THEN
      CONTINUE WHEN regexp_replace(lower(btrim(v_old)),'\s','','g')=regexp_replace(v_key,'\s','','g');
      UPDATE player_discord_map SET player_key=v_key, display_name=v_name, updated_at=now() WHERE discord_user_id=v_id;
      IF NOT EXISTS(SELECT 1 FROM player_name_aliases WHERE lower(old_name)=lower(v_old) AND lower(canonical_name)=v_key) THEN
        INSERT INTO player_name_aliases(old_name, canonical_name) VALUES (v_old, v_name);
      END IF;
      changes := changes || jsonb_build_object('kind','discord_relinked','discord_user_id',v_id,'from',v_old,'to',v_name);
    ELSIF EXISTS(SELECT 1 FROM player_discord_map WHERE lower(btrim(player_key))=v_key) THEN
      UPDATE player_discord_map SET discord_user_id=v_id, updated_at=now() WHERE lower(btrim(player_key))=v_key;
      changes := changes || jsonb_build_object('kind','discord_linked','discord_user_id',v_id,'to',v_name);
    ELSIF EXISTS(SELECT 1 FROM player_discord_map WHERE discord_user_id=v_id) THEN
      UPDATE player_discord_map SET player_key=v_key, display_name=coalesce(display_name,v_name), updated_at=now() WHERE discord_user_id=v_id;
      changes := changes || jsonb_build_object('kind','discord_linked','discord_user_id',v_id,'to',v_name);
    ELSE
      INSERT INTO player_discord_map(player_key,display_name,discord_user_id,discord_username,source)
      SELECT v_key, v_name, v_id, m.discord_username, 'lobby_result'
      FROM (SELECT (SELECT discord_username FROM discord_guild_members WHERE discord_user_id=v_id) AS discord_username) m
      WHERE NOT EXISTS(SELECT 1 FROM player_discord_map x WHERE m.discord_username IS NOT NULL AND lower(btrim(x.discord_username))=lower(btrim(m.discord_username)));
      IF FOUND THEN changes := changes || jsonb_build_object('kind','discord_linked','discord_user_id',v_id,'to',v_name); END IF;
    END IF;
    n := n+1;
  END LOOP;
  IF jsonb_array_length(changes) > 0 THEN
    INSERT INTO lfg_lobby_events(lobby_id, actor_name, kind, detail)
    VALUES (p_lobby_id, 'Result upload', 'identity_auto_update',
      (SELECT string_agg(coalesce(c->>'from','—')||' → '||(c->>'to'), ', ') FROM jsonb_array_elements(changes) c WHERE c->>'kind'<>'alias_added'));
  END IF;
  RETURN jsonb_build_object('ok',true,'mapped',n,'changes',changes);
END $function$;
REVOKE EXECUTE ON FUNCTION public.lfg_record_result_identities(bigint,jsonb) FROM PUBLIC, anon, authenticated;