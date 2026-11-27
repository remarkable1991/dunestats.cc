import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PendingTournamentGame = {
  id: string;
  tournament_num: number;
  round_type: string | null;
  table_identifier: string | null;
  created_at: string;
  unmatched: unknown;
  game_id: string | null;
};

/** Pending tournament reviews the signed-in user submitted (access rules limit rows to own submissions). */
export function usePendingTournamentGames() {
  const [userId, setUserId] = useState<string | null>(null);
  const [rows, setRows] = useState<PendingTournamentGame[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUserId(s?.user.id ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      const { data } = await supabase
        .from("tournament_pending_matches")
        .select("id,tournament_num,round_type,table_identifier,created_at,unmatched,game_id")
        .eq("status", "pending")
        .eq("submitted_by", userId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (!cancelled) setRows((data ?? []) as PendingTournamentGame[]);
    };
    void refresh();
    const t = setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [userId]);

  return { userId, rows };
}

export function unmatchedNames(u: unknown): string[] {
  if (!Array.isArray(u)) return [];
  return u
    .map((x) => (typeof x === "string" ? x : x && typeof x === "object" ? String((x as Record<string, unknown>)["name"] ?? (x as Record<string, unknown>)["player_name"] ?? "") : ""))
    .filter(Boolean);
}
