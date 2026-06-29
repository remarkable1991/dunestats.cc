
CREATE TABLE public.tournament_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_num integer NOT NULL,
  round_type text NOT NULL,
  table_identifier text NOT NULL,
  player_name text NOT NULL,
  discord_username text,
  leader_name text,
  placement integer,
  points integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tournament_matches_lookup_idx ON public.tournament_matches (tournament_num, round_type, table_identifier);
GRANT SELECT ON public.tournament_matches TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournament_matches TO authenticated;
GRANT ALL ON public.tournament_matches TO service_role;
ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY tm_public_read ON public.tournament_matches FOR SELECT USING (true);
CREATE POLICY tm_admin_write ON public.tournament_matches FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.tournament_table_screenshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_num integer NOT NULL,
  round_type text NOT NULL,
  table_identifier text NOT NULL,
  image_url text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_num, round_type, table_identifier)
);
GRANT SELECT ON public.tournament_table_screenshots TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournament_table_screenshots TO authenticated;
GRANT ALL ON public.tournament_table_screenshots TO service_role;
ALTER TABLE public.tournament_table_screenshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY tts_public_read ON public.tournament_table_screenshots FOR SELECT USING (true);
CREATE POLICY tts_auth_insert ON public.tournament_table_screenshots FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY tts_owner_update ON public.tournament_table_screenshots FOR UPDATE TO authenticated USING (created_by = auth.uid() OR public.has_role(auth.uid(),'admin')) WITH CHECK (true);
CREATE POLICY tts_owner_delete ON public.tournament_table_screenshots FOR DELETE TO authenticated USING (created_by = auth.uid() OR public.has_role(auth.uid(),'admin'));
