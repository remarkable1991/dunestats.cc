ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS play_mode text NOT NULL DEFAULT 'async';
ALTER TABLE public.tournaments DROP CONSTRAINT IF EXISTS tournaments_play_mode_check;
ALTER TABLE public.tournaments ADD CONSTRAINT tournaments_play_mode_check CHECK (play_mode IN ('live','async'));
UPDATE public.tournaments SET play_mode = CASE WHEN tournament_num >= 16 THEN 'live' ELSE 'async' END;