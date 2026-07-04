CREATE POLICY tm_auth_update ON public.tournament_matches
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);