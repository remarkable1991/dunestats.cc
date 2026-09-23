import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AppRole =
  | "admin"
  | "moderator"
  | "user"
  | "lfg_admin"
  | "tournament_host"
  | "tournament_moderator"
  | "match_moderator";

export type RoleState = {
  loading: boolean;
  userId: string | null;
  roles: AppRole[];
  isAdmin: boolean;
  /** Full tournament admin access (create/edit tournaments, emails). */
  isTournamentHost: boolean;
  /** Access to tournament match approvals. */
  isTournamentModerator: boolean;
  /** Can edit any match and set the verified state. */
  isMatchModerator: boolean;
  isLfgAdmin: boolean;
};

/** Loads the signed-in user's roles once and derives the access flags. */
export function useRoles(): RoleState {
  const [state, setState] = useState<RoleState>({
    loading: true,
    userId: null,
    roles: [],
    isAdmin: false,
    isTournamentHost: false,
    isTournamentModerator: false,
    isMatchModerator: false,
    isLfgAdmin: false,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user.id ?? null;
      if (!uid) {
        if (!cancelled) setState((s) => ({ ...s, loading: false, userId: null }));
        return;
      }
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      if (cancelled) return;
      const roles = ((data ?? []) as { role: AppRole }[]).map((r) => r.role);
      const has = (r: AppRole) => roles.includes(r);
      const admin = has("admin");
      setState({
        loading: false,
        userId: uid,
        roles,
        isAdmin: admin,
        isTournamentHost: admin || has("tournament_host"),
        isTournamentModerator: admin || has("tournament_moderator"),
        isMatchModerator: admin || has("match_moderator"),
        isLfgAdmin: admin || has("lfg_admin"),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
