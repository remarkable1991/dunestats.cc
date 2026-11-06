DO $repair$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.games
    WHERE id = '931f41dd-8e1e-4c08-97c5-fd7508725b98'
      AND public_match_id = 'MEEKER-PLASTEEL-7914'
  ) THEN
    RAISE EXCEPTION 'Expected Lobby 538 game was not found';
  END IF;

  IF (SELECT count(*) FROM public.game_results
      WHERE game_id = '931f41dd-8e1e-4c08-97c5-fd7508725b98'
        AND lower(player_name) = 'ámenhotep') <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one accented Amenhotep result';
  END IF;

  IF (SELECT count(*) FROM public.player_ratings WHERE player_key = 'ámenhotep') <> 2
     OR (SELECT count(*) FROM public.player_ratings WHERE player_key = 'amenhotep') <> 2 THEN
    RAISE EXCEPTION 'Unexpected player rating rows; repair aborted';
  END IF;
END
$repair$;

UPDATE public.game_results
SET player_name = 'Amenhotep'
WHERE game_id = '931f41dd-8e1e-4c08-97c5-fd7508725b98'
  AND lower(player_name) = 'ámenhotep';

UPDATE public.league_match_rating_deltas
SET player_key = 'amenhotep', updated_at = now()
WHERE game_id = '931f41dd-8e1e-4c08-97c5-fd7508725b98'
  AND player_key = 'ámenhotep';

UPDATE public.player_league_ratings AS target
SET elo = target.elo + (source.elo - 1000),
    games_played = target.games_played + source.games_played,
    wins = target.wins + source.wins,
    updated_at = now()
FROM public.player_league_ratings AS source
WHERE target.player_key = 'amenhotep'
  AND source.player_key = 'ámenhotep'
  AND source.season = target.season;

DELETE FROM public.player_league_ratings
WHERE player_key = 'ámenhotep';

UPDATE public.player_ratings AS target
SET elo = target.elo + (source.elo - 1000),
    games_played = target.games_played + source.games_played,
    wins = target.wins + source.wins,
    top2 = target.top2 + source.top2,
    total_points = target.total_points + source.total_points,
    updated_at = now()
FROM public.player_ratings AS source
WHERE target.player_key = 'amenhotep'
  AND source.player_key = 'ámenhotep'
  AND source.game_version = target.game_version;

DELETE FROM public.player_ratings
WHERE player_key = 'ámenhotep';

UPDATE public.sp_events
SET player_key = 'amenhotep'
WHERE player_key = 'ámenhotep';

UPDATE public.player_sp AS target
SET lifetime_sp = target.lifetime_sp + source.lifetime_sp,
    seasonal_sp = target.seasonal_sp + source.seasonal_sp,
    updated_at = now()
FROM public.player_sp AS source
WHERE target.player_key = 'amenhotep'
  AND source.player_key = 'ámenhotep';

DELETE FROM public.player_sp
WHERE player_key = 'ámenhotep';

UPDATE public.player_season_sp AS target
SET seasonal_sp = target.seasonal_sp + source.seasonal_sp,
    updated_at = now()
FROM public.player_season_sp AS source
WHERE target.player_key = 'amenhotep'
  AND source.player_key = 'ámenhotep'
  AND source.season_id = target.season_id;

DELETE FROM public.player_season_sp
WHERE player_key = 'ámenhotep';

INSERT INTO public.player_name_aliases (old_name, canonical_name)
SELECT 'ámenhotep', 'Amenhotep'
WHERE NOT EXISTS (
  SELECT 1 FROM public.player_name_aliases
  WHERE lower(old_name) = 'ámenhotep'
    AND lower(canonical_name) = 'amenhotep'
);

DO $verify$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.game_results
    WHERE game_id = '931f41dd-8e1e-4c08-97c5-fd7508725b98'
      AND lower(player_name) = 'ámenhotep'
  ) OR EXISTS (SELECT 1 FROM public.player_ratings WHERE player_key = 'ámenhotep')
     OR EXISTS (SELECT 1 FROM public.player_league_ratings WHERE player_key = 'ámenhotep')
     OR EXISTS (SELECT 1 FROM public.league_match_rating_deltas WHERE game_id = '931f41dd-8e1e-4c08-97c5-fd7508725b98' AND player_key = 'ámenhotep')
     OR EXISTS (SELECT 1 FROM public.player_sp WHERE player_key = 'ámenhotep')
     OR EXISTS (SELECT 1 FROM public.player_season_sp WHERE player_key = 'ámenhotep')
     OR EXISTS (SELECT 1 FROM public.sp_events WHERE player_key = 'ámenhotep') THEN
    RAISE EXCEPTION 'Accented player records remain after repair';
  END IF;
END
$verify$;