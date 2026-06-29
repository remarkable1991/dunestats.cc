DROP POLICY IF EXISTS tm_authenticated_read ON public.tournament_matches;
CREATE POLICY tm_public_read ON public.tournament_matches FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.tournament_matches TO anon;