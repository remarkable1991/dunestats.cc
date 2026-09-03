CREATE OR REPLACE FUNCTION public.tournament_roster_registration_availability(p_tournament_num integer, p_player_names text[])
RETURNS TABLE(player_name text, availability jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.direwolf_name AS player_name, r.availability
  FROM public.tournament_registrations r
  WHERE r.tournament_num = p_tournament_num
    AND lower(btrim(r.direwolf_name)) = ANY (
      SELECT lower(btrim(n)) FROM unnest(coalesce(p_player_names, '{}'::text[])) AS n
    )
$$;

GRANT EXECUTE ON FUNCTION public.tournament_roster_registration_availability(integer, text[]) TO anon, authenticated, service_role;