
DROP POLICY tts_owner_update ON public.tournament_table_screenshots;
CREATE POLICY tts_owner_update ON public.tournament_table_screenshots FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(),'admin'));
