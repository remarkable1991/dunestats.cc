CREATE TABLE public.survey_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  intro text NOT NULL DEFAULT '',
  icon text NOT NULL DEFAULT 'sparkles',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.survey_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.survey_categories(id) ON DELETE CASCADE,
  prompt text NOT NULL,
  help_text text NOT NULL DEFAULT '',
  question_type text NOT NULL DEFAULT 'single_choice',
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX survey_questions_category_idx ON public.survey_questions (category_id, sort_order);

CREATE TABLE public.survey_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.survey_categories(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  player_key text,
  session_token text,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX survey_responses_user_cat_idx ON public.survey_responses (category_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX survey_responses_cat_idx ON public.survey_responses (category_id);

GRANT SELECT ON public.survey_categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.survey_categories TO authenticated;
GRANT ALL ON public.survey_categories TO service_role;

GRANT SELECT ON public.survey_questions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.survey_questions TO authenticated;
GRANT ALL ON public.survey_questions TO service_role;

GRANT INSERT ON public.survey_responses TO anon;
GRANT SELECT, INSERT, UPDATE ON public.survey_responses TO authenticated;
GRANT ALL ON public.survey_responses TO service_role;

ALTER TABLE public.survey_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "survey_categories_public_read" ON public.survey_categories
  FOR SELECT USING (is_active OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "survey_categories_admin_write" ON public.survey_categories
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "survey_questions_public_read" ON public.survey_questions
  FOR SELECT USING (is_active OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "survey_questions_admin_write" ON public.survey_questions
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "survey_responses_insert_any" ON public.survey_responses
  FOR INSERT WITH CHECK (user_id IS NULL OR user_id = auth.uid());
CREATE POLICY "survey_responses_read_own" ON public.survey_responses
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "survey_responses_update_own" ON public.survey_responses
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER survey_categories_touch BEFORE UPDATE ON public.survey_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER survey_questions_touch BEFORE UPDATE ON public.survey_questions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER survey_responses_touch BEFORE UPDATE ON public.survey_responses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();