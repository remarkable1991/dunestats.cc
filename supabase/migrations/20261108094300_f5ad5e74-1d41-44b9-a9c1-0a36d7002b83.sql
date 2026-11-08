DO $repair$
DECLARE v_game uuid; v_lobby public.active_async_matches%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('admin-lobby-revert'));
  SELECT * INTO v_lobby FROM public.active_async_matches WHERE id=593 FOR UPDATE;
  SELECT id INTO v_game FROM public.games WHERE public_match_id='BASIN-SIETCH-5272' FOR UPDATE;
  IF v_game IS NULL OR v_lobby.linked_game_id IS DISTINCT FROM v_game OR NOT v_lobby.is_league OR coalesce(v_lobby.season_num,v_lobby.season_id) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Lobby 593 link or season changed; no repair applied';
  END IF;
  IF EXISTS(SELECT 1 FROM public.active_async_matches WHERE linked_game_id=v_game AND id<>593) THEN RAISE EXCEPTION 'Match has another lobby link'; END IF;
  IF (SELECT count(*) FROM public.game_results WHERE game_id=v_game)<>4 OR
     (SELECT count(*) FROM public.game_results WHERE game_id=v_game AND (lower(btrim(player_name)),placement) IN (('astateofchance',1),('onetwo',2),('valor',3),('mxp01',4)))<>4 THEN
    RAISE EXCEPTION 'Match roster changed; no repair applied';
  END IF;
  IF EXISTS(SELECT 1 FROM public.league_match_rating_deltas WHERE game_id=v_game) THEN RAISE EXCEPTION 'Ratings already exist; refusing to apply twice'; END IF;
  UPDATE public.games SET is_league=true WHERE id=v_game;
  PERFORM public.apply_league_match_ratings(v_game,1,'[{"player_key":"astateofchance","elo_delta":10.79,"won":true},{"player_key":"onetwo","elo_delta":4.24,"won":false},{"player_key":"valor","elo_delta":-1.82,"won":false},{"player_key":"mxp01","elo_delta":-13.21,"won":false}]'::jsonb);
END $repair$;