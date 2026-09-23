ALTER FUNCTION public.touch_last_sign_in() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_all_storage_files(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.auto_link_legacy_discord_stats() SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_discord_identity_to_player_map() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_recruitment_leaderboard() SET search_path = public, pg_temp;
ALTER FUNCTION public.dismiss_user_notification(text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_player_achievements(text) SET search_path = public, pg_temp;