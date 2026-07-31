CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.tournaments (
  tournament_num integer PRIMARY KEY,
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  required_availability_pct numeric NOT NULL DEFAULT 5,
  required_weekly_pct numeric NOT NULL DEFAULT 0,
  checkboxes jsonb NOT NULL DEFAULT '[]'::jsonb,
  info_title text,
  info_text text,
  registration_open boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tournaments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournaments TO authenticated;
GRANT ALL ON public.tournaments TO service_role;

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tournaments_public_read" ON public.tournaments FOR SELECT USING (true);
CREATE POLICY "tournaments_admin_insert" ON public.tournaments FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "tournaments_admin_update" ON public.tournaments FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "tournaments_admin_delete" ON public.tournaments FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER tournaments_set_updated_at BEFORE UPDATE ON public.tournaments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.tournament_registrations ADD COLUMN IF NOT EXISTS consents jsonb NOT NULL DEFAULT '{}'::jsonb;