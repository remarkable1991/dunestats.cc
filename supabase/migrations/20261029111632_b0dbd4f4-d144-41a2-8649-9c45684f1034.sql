CREATE TABLE public.lfg_result_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lobby_id bigint NOT NULL REFERENCES public.active_async_matches(id) ON DELETE CASCADE,
  game_id uuid REFERENCES public.games(id) ON DELETE SET NULL,
  public_match_id text,
  status text NOT NULL CHECK (status IN ('green','yellow','orange')),
  players jsonb NOT NULL DEFAULT '[]'::jsonb,
  submitted_by uuid NOT NULL,
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.lfg_result_reviews TO authenticated;
GRANT ALL ON public.lfg_result_reviews TO service_role;
ALTER TABLE public.lfg_result_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Submitters insert own reviews" ON public.lfg_result_reviews FOR INSERT TO authenticated
  WITH CHECK (submitted_by = auth.uid() AND resolved_by IS NULL AND resolved_at IS NULL);
CREATE POLICY "Submitters and LFG admins read reviews" ON public.lfg_result_reviews FOR SELECT TO authenticated
  USING (submitted_by = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'lfg_admin'));
CREATE POLICY "LFG admins resolve reviews" ON public.lfg_result_reviews FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'lfg_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'lfg_admin'));
CREATE INDEX lfg_result_reviews_open_idx ON public.lfg_result_reviews (created_at DESC) WHERE resolved_at IS NULL;
CREATE TRIGGER lfg_result_reviews_updated_at BEFORE UPDATE ON public.lfg_result_reviews FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();