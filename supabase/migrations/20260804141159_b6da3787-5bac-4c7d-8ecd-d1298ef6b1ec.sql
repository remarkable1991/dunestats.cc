ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS prizes_summary text,
  ADD COLUMN IF NOT EXISTS prizes_text text;