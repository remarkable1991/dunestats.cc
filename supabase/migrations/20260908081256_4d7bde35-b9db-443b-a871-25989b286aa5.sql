-- Rebuild live ratings for lfcazn from full history
WITH agg AS (
  SELECT g.game_version AS gv,
         count(*) AS n,
         sum(r.elo_delta) AS dv,
         sum(r.elo_delta_overall) AS dov,
         sum(CASE WHEN r.placement = 1 THEN 1 ELSE 0 END) AS w,
         sum(CASE WHEN r.placement <= 2 THEN 1 ELSE 0 END) AS t2,
         sum(r.points) AS pts
  FROM public.game_results r
  JOIN public.games g ON g.id = r.game_id
  WHERE lower(trim(r.player_name)) = 'lfcazn'
  GROUP BY g.game_version
),
rows AS (
  SELECT gv, 1000 + dv AS elo, n, w, t2, pts FROM agg
  UNION ALL
  SELECT 'overall'::game_version, 1000 + sum(dov), sum(n), sum(w), sum(t2), sum(pts) FROM agg
)
INSERT INTO public.player_ratings (player_key, display_name, game_version, elo, games_played, wins, top2, total_points, updated_at, claimed_by)
SELECT 'lfcazn', 'Lfcazn', gv, elo, n, w, t2, pts, now(),
       (SELECT claimed_by FROM public.player_ratings WHERE player_key = 'lfcazn' AND claimed_by IS NOT NULL LIMIT 1)
FROM rows
ON CONFLICT (player_key, game_version) DO UPDATE
SET display_name = EXCLUDED.display_name,
    elo = EXCLUDED.elo,
    games_played = EXCLUDED.games_played,
    wins = EXCLUDED.wins,
    top2 = EXCLUDED.top2,
    total_points = EXCLUDED.total_points,
    updated_at = now();

-- Rebuild sandbox overall rating for lfcazn
UPDATE public.sandbox_player_ratings sr
SET elo = 1000 + s.dv,
    overall_vp_elo = 1000 + s.vp,
    games_played = s.n,
    wins = s.w,
    top2 = s.t2,
    total_points = s.pts,
    display_name = 'Lfcazn',
    updated_at = now()
FROM (
  SELECT count(*) AS n,
         coalesce(sum(r.elo_delta_overall), 0) AS dv,
         coalesce(sum(r.vp_overall_delta), 0) AS vp,
         sum(CASE WHEN r.placement = 1 THEN 1 ELSE 0 END) AS w,
         sum(CASE WHEN r.placement <= 2 THEN 1 ELSE 0 END) AS t2,
         coalesce(sum(r.points), 0) AS pts
  FROM public.sandbox_game_results r
  WHERE lower(trim(r.player_name)) = 'lfcazn'
) s
WHERE sr.player_key = 'lfcazn' AND sr.game_version = 'overall';