ALTER TABLE public.tournament_matches
  ALTER COLUMN table_score TYPE numeric USING table_score::numeric,
  ALTER COLUMN player_compatibility_score TYPE numeric USING player_compatibility_score::numeric;