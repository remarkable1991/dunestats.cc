import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Account-saved "League only" view toggle; signed-out visitors always start off. */
export function useLeagueOnlyView() {
  const [userId, setUserId] = useState<string | null>(null);
  const [leagueOnly, setLeagueOnlyState] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async (uid: string | null) => {
      setUserId(uid);
      if (!uid) return setLeagueOnlyState(false);
      const { data } = await supabase.from("profiles").select("league_only_view" as never).eq("id", uid).maybeSingle();
      if (active) setLeagueOnlyState(Boolean((data as { league_only_view?: boolean } | null)?.league_only_view));
    };
    supabase.auth.getSession().then(({ data }) => load(data.session?.user.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => void load(s?.user.id ?? null));
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  const setLeagueOnly = useCallback(async (next: boolean) => {
    setLeagueOnlyState(next);
    if (userId) await supabase.from("profiles").update({ league_only_view: next } as never).eq("id", userId);
  }, [userId]);

  return { leagueOnly, setLeagueOnly };
}
