ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS board_version text NOT NULL DEFAULT 'uprising',
  ADD COLUMN IF NOT EXISTS has_rise_of_ix boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_epic_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_immortality boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_base_leaders boolean NOT NULL DEFAULT false;

UPDATE public.tournaments SET has_immortality = true, board_version = 'uprising' WHERE tournament_num IN (14, 16);