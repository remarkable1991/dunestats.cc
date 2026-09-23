CREATE TABLE IF NOT EXISTS public.email_templates (
  id text PRIMARY KEY,
  subject_template text NOT NULL DEFAULT '',
  html_template text NOT NULL DEFAULT '',
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.email_templates TO authenticated;
GRANT ALL ON public.email_templates TO service_role;

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read email templates" ON public.email_templates;
CREATE POLICY "Authenticated can read email templates"
  ON public.email_templates FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage email templates" ON public.email_templates;
CREATE POLICY "Admins manage email templates"
  ON public.email_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS set_email_templates_updated_at ON public.email_templates;
CREATE TRIGGER set_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tournament_emails_opt_in boolean NOT NULL DEFAULT true;

INSERT INTO public.email_templates (id, subject_template, html_template)
VALUES ('tournament_announcement', '⚔️ Tournament {{tournament_num}}: {{tournament_name}}', '')
ON CONFLICT (id) DO NOTHING;