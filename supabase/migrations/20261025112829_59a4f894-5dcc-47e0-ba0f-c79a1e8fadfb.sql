REVOKE ALL ON FUNCTION public.lfg_alert_lobby_changed() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.lfg_alert_chat_changed() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.lfg_league_start_guard() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.lfg_start_game(bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.lfg_start_game(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lfg_alert_lobby_changed(),public.lfg_alert_chat_changed(),public.lfg_league_start_guard() TO service_role;