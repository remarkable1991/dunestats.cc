
DROP POLICY tm_admin_write ON public.tournament_matches;
CREATE POLICY tm_auth_update ON public.tournament_matches FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY tm_admin_insert ON public.tournament_matches FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY tm_admin_delete ON public.tournament_matches FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
