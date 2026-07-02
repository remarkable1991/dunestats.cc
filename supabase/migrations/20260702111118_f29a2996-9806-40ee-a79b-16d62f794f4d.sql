
-- Allow anonymous tournament registrations (user_id nullable)
ALTER TABLE public.tournament_registrations ALTER COLUMN user_id DROP NOT NULL;

-- Ensure no duplicate anon registrations with same direwolf name for a tournament
CREATE UNIQUE INDEX IF NOT EXISTS tournament_registrations_anon_unique
  ON public.tournament_registrations (tournament_num, lower(direwolf_name))
  WHERE user_id IS NULL;

-- Allow anon to insert their own registration
GRANT INSERT ON public.tournament_registrations TO anon;

DROP POLICY IF EXISTS "anon registration insert" ON public.tournament_registrations;
CREATE POLICY "anon registration insert"
  ON public.tournament_registrations
  FOR INSERT
  TO anon
  WITH CHECK (user_id IS NULL);
