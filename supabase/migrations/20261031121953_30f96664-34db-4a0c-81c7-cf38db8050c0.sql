DROP POLICY IF EXISTS lfg_public_read ON public.active_async_matches;
CREATE POLICY lfg_public_read ON public.active_async_matches FOR SELECT TO anon, authenticated USING (true);