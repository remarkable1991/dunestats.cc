-- Add tournament_num to games and backfill from tournament_matches by player+points fingerprint.
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS tournament_num integer;
CREATE INDEX IF NOT EXISTS games_tournament_num_idx ON public.games(tournament_num);

WITH matched AS (
  SELECT
    gr.game_id,
    tm.tournament_num,
    count(*) AS hits
  FROM public.game_results gr
  JOIN public.tournament_matches tm
    ON lower(btrim(tm.player_name)) = lower(btrim(gr.player_name))
   AND tm.points IS NOT NULL
   AND tm.points = gr.points
  GROUP BY gr.game_id, tm.tournament_num
),
best AS (
  SELECT DISTINCT ON (game_id) game_id, tournament_num, hits
  FROM matched
  WHERE hits >= 3
  ORDER BY game_id, hits DESC, tournament_num DESC
)
UPDATE public.games g
SET tournament_num = b.tournament_num
FROM best b
WHERE g.id = b.game_id AND g.tournament_num IS NULL;
