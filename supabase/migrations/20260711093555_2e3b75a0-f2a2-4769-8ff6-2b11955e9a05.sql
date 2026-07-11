
-- Pin search_path on the sql helper
CREATE OR REPLACE FUNCTION public.sp_season_for(ts timestamptz)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT id FROM public.sp_seasons WHERE ts >= starts_at AND ts < ends_at LIMIT 1;
$$;

-- Ensure the SECURITY DEFINER helpers are not callable by anon/authenticated
REVOKE ALL ON FUNCTION public.sp_award(text, text, integer, timestamptz, uuid, integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sp_backfill() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sp_season_for(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sp_season_for(timestamptz) TO anon, authenticated;
