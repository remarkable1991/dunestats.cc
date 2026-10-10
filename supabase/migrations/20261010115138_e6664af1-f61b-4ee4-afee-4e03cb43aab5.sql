REVOKE ALL ON FUNCTION public.mm_fill_new_league_lobby() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mm_fill_lobby(bigint) FROM PUBLIC, anon, authenticated;
ALTER TABLE public.league_presets ADD COLUMN IF NOT EXISTS modules text[] NOT NULL DEFAULT '{}'::text[];