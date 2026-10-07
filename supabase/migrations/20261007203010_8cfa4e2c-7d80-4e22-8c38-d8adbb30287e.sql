GRANT SELECT ON public.player_league_ratings TO authenticated;
GRANT ALL ON public.player_league_ratings TO service_role;
ALTER TABLE public.player_league_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY league_ratings_pilot_read ON public.player_league_ratings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'lfg_admin'));