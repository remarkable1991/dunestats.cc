DROP POLICY IF EXISTS tm_participant_update ON public.tournament_matches;

CREATE POLICY tm_authenticated_update ON public.tournament_matches
FOR UPDATE TO authenticated
USING (true)
WITH CHECK (true);