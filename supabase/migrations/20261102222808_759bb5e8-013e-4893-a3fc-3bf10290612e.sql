ALTER FUNCTION public.lfg_assign_active_season() SECURITY DEFINER;
ALTER TABLE public.active_async_matches
  ALTER COLUMN season_id DROP DEFAULT,
  ALTER COLUMN season_num DROP DEFAULT;
REVOKE EXECUTE ON FUNCTION public.lfg_assign_active_season() FROM PUBLIC, anon, authenticated;