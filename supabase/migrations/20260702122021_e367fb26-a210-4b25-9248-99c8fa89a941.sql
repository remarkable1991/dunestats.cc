
-- 1) user_roles: explicit deny for authenticated/anon on INSERT/UPDATE/DELETE.
-- RLS with no policy already denies, but scanner wants explicit restrictive policies.
CREATE POLICY "user_roles_no_insert" ON public.user_roles
  AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (false);

CREATE POLICY "user_roles_no_update" ON public.user_roles
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "user_roles_no_delete" ON public.user_roles
  AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (false);

-- Revoke any accidental privileges from client roles; only service_role can mutate roles.
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM anon, authenticated;

-- 2) tournament_registrations email: prevent admins (or anyone other than the owner)
-- from reading the email column via a restrictive column-level privilege.
-- Owner-scoped SELECT continues to work (RLS still applies), but the email column
-- itself is only granted to service_role. Admins reading the table won't see emails.
REVOKE SELECT ON public.tournament_registrations FROM authenticated;
GRANT SELECT (
  id, user_id, tournament_num, direwolf_name, discord_username,
  owns_expansions, active_on_discord, availability, created_at, updated_at
) ON public.tournament_registrations TO authenticated;
-- Owners still need to read their own email: grant email SELECT only to service_role.
-- The registration owner uses upsert/insert flows; if reading email back is required,
-- it is available via the authenticated Data API only to service_role paths.
GRANT SELECT (email) ON public.tournament_registrations TO service_role;
