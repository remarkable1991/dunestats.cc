UPDATE public.active_async_matches
SET linked_game_id = NULL, status = 'started', league_status = NULL
WHERE id IN (822, 559, 414);

UPDATE public.games
SET is_league = true
WHERE public_match_id = 'BASIN-FILTRATION-4698';

DO $$
DECLARE
  v_game uuid;
  v_ledger_count integer;
BEGIN
  SELECT id INTO v_game FROM public.games WHERE public_match_id = 'BASIN-FILTRATION-4698';
  IF v_game IS NULL THEN
    RAISE EXCEPTION 'BASIN-FILTRATION-4698 not found';
  END IF;
  SELECT count(*) INTO v_ledger_count FROM public.league_match_rating_deltas WHERE game_id = v_game;
  IF v_ledger_count = 0 THEN
    PERFORM public.apply_league_match_ratings(
      v_game,
      1,
      '[
        {"player_key":"lfcazn","elo_delta":16.33,"won":true},
        {"player_key":"riogo","elo_delta":6.17,"won":false},
        {"player_key":"maziyt","elo_delta":-6.41,"won":false},
        {"player_key":"spellcastermax","elo_delta":-16.08,"won":false}
      ]'::jsonb
    );
  ELSIF v_ledger_count <> 4 THEN
    RAISE EXCEPTION 'BASIN-FILTRATION-4698 has an incomplete League rating ledger';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS active_async_matches_linked_game_id_uniq
ON public.active_async_matches (linked_game_id)
WHERE linked_game_id IS NOT NULL;