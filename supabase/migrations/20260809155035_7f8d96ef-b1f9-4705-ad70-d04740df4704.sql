ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS total_players integer,
  ADD COLUMN IF NOT EXISTS direct_to_grand_final integer,
  ADD COLUMN IF NOT EXISTS to_semifinal integer;