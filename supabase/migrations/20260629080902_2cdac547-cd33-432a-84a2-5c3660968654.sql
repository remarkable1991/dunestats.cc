
-- 1. Restrict profiles read to authenticated only
DROP POLICY IF EXISTS profiles_public_read ON public.profiles;
CREATE POLICY profiles_authenticated_read ON public.profiles
  FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.profiles FROM anon;

-- 2. Restrict tournament_matches read to authenticated; lock UPDATE to admins
DROP POLICY IF EXISTS tm_public_read ON public.tournament_matches;
CREATE POLICY tm_authenticated_read ON public.tournament_matches
  FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.tournament_matches FROM anon;

DROP POLICY IF EXISTS tm_auth_update ON public.tournament_matches;
CREATE POLICY tm_admin_update ON public.tournament_matches
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 3. Move has_role into a private schema (not exposed via PostgREST)
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

REVOKE EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;

-- Repoint all policies from public.has_role -> private.has_role
DROP POLICY IF EXISTS games_owner_or_admin_delete ON public.games;
CREATE POLICY games_owner_or_admin_delete ON public.games
  FOR DELETE TO authenticated
  USING ((created_by = auth.uid()) OR private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS game_results_owner_or_admin_delete ON public.game_results;
CREATE POLICY game_results_owner_or_admin_delete ON public.game_results
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.games g
    WHERE g.id = game_results.game_id
      AND ((g.created_by = auth.uid()) OR private.has_role(auth.uid(), 'admin'::public.app_role))
  ));

DROP POLICY IF EXISTS tts_owner_delete ON public.tournament_table_screenshots;
CREATE POLICY tts_owner_delete ON public.tournament_table_screenshots
  FOR DELETE TO authenticated
  USING ((created_by = auth.uid()) OR private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS tts_owner_update ON public.tournament_table_screenshots;
CREATE POLICY tts_owner_update ON public.tournament_table_screenshots
  FOR UPDATE TO authenticated
  USING ((created_by = auth.uid()) OR private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK ((created_by = auth.uid()) OR private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS tm_admin_insert ON public.tournament_matches;
CREATE POLICY tm_admin_insert ON public.tournament_matches
  FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS tm_admin_delete ON public.tournament_matches;
CREATE POLICY tm_admin_delete ON public.tournament_matches
  FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY tm_admin_update_priv ON public.tournament_matches
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS tm_admin_update ON public.tournament_matches;
ALTER POLICY tm_admin_update_priv ON public.tournament_matches RENAME TO tm_admin_update;

-- Drop the old public.has_role now that nothing references it
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);

-- Server functions call has_role via supabaseAdmin.rpc("has_role", ...). Provide a thin public wrapper that delegates to the private impl, callable only by service_role (admin).
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.has_role(_user_id, _role)
$$;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;
