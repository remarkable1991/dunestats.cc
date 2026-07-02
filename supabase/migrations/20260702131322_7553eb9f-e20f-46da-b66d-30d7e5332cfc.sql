
-- Restore access broken by prior lockdown migration.

-- 1) Ensure has_role is executable by client roles (RLS policies call it).
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated;

-- 2) Restore table-level SELECT on tournament_registrations to authenticated,
--    but keep email hidden from non-owners by dropping the admin bypass on SELECT.
--    Admins who need emails go through service_role paths.
GRANT SELECT ON public.tournament_registrations TO authenticated;

DROP POLICY IF EXISTS "own registration select" ON public.tournament_registrations;
CREATE POLICY "own registration select"
  ON public.tournament_registrations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
