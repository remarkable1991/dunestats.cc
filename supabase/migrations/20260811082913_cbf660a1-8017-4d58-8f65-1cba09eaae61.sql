ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS semifinal_seeding text NOT NULL DEFAULT 'snake';

ALTER TABLE public.tournaments
  DROP CONSTRAINT IF EXISTS tournaments_semifinal_seeding_check;

ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_semifinal_seeding_check
  CHECK (semifinal_seeding IN ('snake', 'manual'));