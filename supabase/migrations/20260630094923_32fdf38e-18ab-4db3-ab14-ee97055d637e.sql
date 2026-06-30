CREATE TABLE public.past_tournament_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_num INT NOT NULL,
  round_type TEXT NOT NULL,
  table_identifier TEXT NOT NULL,
  filename TEXT,
  placement INT NOT NULL,
  player_name TEXT NOT NULL,
  leader_name TEXT,
  points INT NOT NULL DEFAULT 0,
  board_version TEXT NOT NULL DEFAULT 'base',
  has_rise_of_ix BOOLEAN NOT NULL DEFAULT false,
  has_epic_mode BOOLEAN NOT NULL DEFAULT false,
  has_immortality BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX past_tr_tnum_idx ON public.past_tournament_results(tournament_num);
GRANT SELECT ON public.past_tournament_results TO anon, authenticated;
GRANT ALL ON public.past_tournament_results TO service_role;
ALTER TABLE public.past_tournament_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read past tournaments" ON public.past_tournament_results FOR SELECT USING (true);