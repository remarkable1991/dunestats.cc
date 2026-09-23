DROP POLICY IF EXISTS "Authenticated can read email templates" ON public.email_templates;

CREATE POLICY "Tournament staff can read email templates"
ON public.email_templates
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tournament_host'));