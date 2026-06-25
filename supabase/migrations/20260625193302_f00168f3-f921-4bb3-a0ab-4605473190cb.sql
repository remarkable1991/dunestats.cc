
ALTER TABLE public.game_results ADD COLUMN IF NOT EXISTS elo_delta numeric NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS has_used_reset boolean NOT NULL DEFAULT false;
