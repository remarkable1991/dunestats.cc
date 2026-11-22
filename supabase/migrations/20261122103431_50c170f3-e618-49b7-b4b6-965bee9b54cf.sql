GRANT SELECT ON public.league_presets TO anon;
GRANT SELECT ON public.league_presets TO authenticated;

CREATE POLICY "Public can view League formats"
ON public.league_presets
FOR SELECT
TO anon, authenticated
USING (true);