DROP POLICY IF EXISTS tm_auth_update ON public.tournament_matches;

CREATE POLICY tm_participant_update ON public.tournament_matches
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tournament_registrations tr
      WHERE tr.user_id = auth.uid()
        AND tr.tournament_num = tournament_matches.tournament_num
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tournament_registrations tr
      WHERE tr.user_id = auth.uid()
        AND tr.tournament_num = tournament_matches.tournament_num
    )
  );