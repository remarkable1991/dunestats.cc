-- Add 'overall' game_version and backfill an Overall lifetime ELO track.

ALTER TYPE public.game_version ADD VALUE IF NOT EXISTS 'overall';

ALTER TABLE public.game_results
  ADD COLUMN IF NOT EXISTS elo_delta_overall numeric NOT NULL DEFAULT 0;