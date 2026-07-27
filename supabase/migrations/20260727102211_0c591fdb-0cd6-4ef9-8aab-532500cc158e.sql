GRANT SELECT ON public.sandbox_game_results TO anon, authenticated;
GRANT SELECT ON public.sandbox_player_ratings TO anon, authenticated;
CREATE POLICY sandbox_game_results_public_read ON public.sandbox_game_results FOR SELECT USING (true);
CREATE POLICY sandbox_player_ratings_public_read ON public.sandbox_player_ratings FOR SELECT USING (true);