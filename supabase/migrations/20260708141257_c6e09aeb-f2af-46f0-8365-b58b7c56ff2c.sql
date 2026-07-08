REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.save_game_with_ratings(text, boolean, boolean, boolean, boolean, text, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_game_with_ratings(text, boolean, boolean, boolean, boolean, text, integer, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_game_with_rating_revert(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_game_with_rating_revert(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.claim_player_name(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_player_name(text, boolean) TO authenticated;