DO $$
DECLARE g uuid := '2add3c9f-d87c-49c8-9357-3cb58d7a7724'; v jsonb;
BEGIN
  PERFORM public.revert_league_deltas_for_game(g);
  DELETE FROM public.player_league_ratings WHERE season=2 AND games_played=0
    AND player_key IN ('blackshadow','valor','orest1408','misst');
  UPDATE public.active_async_matches SET season_id=1, season_num=1 WHERE id=373;
  WITH p AS (
    SELECT lower(btrim(gr.player_name)) k, gr.placement pl, coalesce(r.elo,1000) e
    FROM public.game_results gr LEFT JOIN public.player_league_ratings r
      ON r.player_key=lower(btrim(gr.player_name)) AND r.season=1
    WHERE gr.game_id=g),
  d AS (
    SELECT a.k, a.pl, round(32.0/3*sum(
      (CASE WHEN a.pl<b.pl THEN 1 WHEN a.pl=b.pl THEN 0.5 ELSE 0 END)
      - 1/(1+power(10,(b.e-a.e)/400.0))),2) delta
    FROM p a JOIN p b ON a.k<>b.k GROUP BY a.k,a.pl)
  SELECT jsonb_agg(jsonb_build_object('player_key',k,'elo_delta',delta,'won',pl=1)) INTO v FROM d;
  PERFORM public.apply_league_match_ratings(g, 1, v);
END $$;