import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Profile-saved preference: show every Elo track on League matches instead of only League Elo. */
export function useShowAllRatingTracks() {
  const [userId, setUserId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async (uid: string | null) => {
      setUserId(uid);
      if (!uid) return setShowAll(false);
      const { data } = await supabase.from("profiles").select("show_all_rating_tracks" as never).eq("id", uid).maybeSingle();
      if (active) setShowAll(Boolean((data as { show_all_rating_tracks?: boolean } | null)?.show_all_rating_tracks));
    };
    supabase.auth.getSession().then(({ data }) => load(data.session?.user.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => void load(s?.user.id ?? null));
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  const update = useCallback(async (next: boolean) => {
    setShowAll(next);
    if (userId) await supabase.from("profiles").update({ show_all_rating_tracks: next } as never).eq("id", userId);
  }, [userId]);

  return { showAll, setShowAll: update, signedIn: !!userId };
}
