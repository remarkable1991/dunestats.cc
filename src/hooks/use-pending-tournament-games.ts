import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SCHEDULE_SELECT, type MatchSchedule } from "@/lib/match-schedules";
import { isActivityParticipant, tournamentActivity, type TournamentReview } from "@/lib/tournament-activity";

export type PendingTournamentGame = TournamentReview;

async function readPages<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await read(from, from + 499);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 500) return rows;
  }
}

/** Shared, account-scoped activity. Reads keep existing access rules intact. */
export function usePendingTournamentGames() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") setUserId(s?.user.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const query = useQuery({
    queryKey: ["my-tournament-activity", userId],
    enabled: !!userId,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      if (!userId) return { rows: [], tournaments: [] };
      const [ratings, mappings, reviews, schedules] = await Promise.all([
        readPages((from, to) => supabase.from("player_ratings").select("player_key,display_name").eq("claimed_by", userId).order("id").range(from, to)),
        readPages((from, to) => supabase.from("player_discord_map").select("player_key,discord_user_id").eq("claimed_by", userId).order("id").range(from, to)),
        readPages((from, to) => supabase.from("tournament_pending_matches").select("id,tournament_num,round_type,table_identifier,created_at,unmatched,game_id").eq("status", "pending").eq("submitted_by", userId).order("created_at", { ascending: false }).order("id").range(from, to)),
        readPages((from, to) => supabase.from("tournament_match_schedules").select(SCHEDULE_SELECT).in("status", ["pending_votes", "ongoing", "confirmed"]).order("id").range(from, to)),
      ]);
      const identity = {
        playerKeys: [...new Set([...ratings.flatMap((r) => [r.player_key, r.display_name]), ...mappings.map((m) => m.player_key)].filter((name): name is string => !!name).map((name) => name.trim().toLowerCase()))],
        discordIds: mappings.map((m) => m.discord_user_id).filter((id): id is string => !!id),
      };
      const mine = (schedules as MatchSchedule[]).filter((s) => isActivityParticipant(s, identity));
      const nums = [...new Set([...mine, ...reviews].map((r) => r.tournament_num))];
      if (!nums.length) return { rows: [], tournaments: [] };
      const [results, tournaments] = await Promise.all([
        readPages((from, to) => supabase.from("tournament_matches").select("tournament_num,round_type,table_identifier,player_name,placement,points").in("tournament_num", nums).order("id").range(from, to)),
        readPages((from, to) => supabase.from("tournaments").select("tournament_num,name,hide_tournament_number").in("tournament_num", nums).order("tournament_num").range(from, to)),
      ]);
      return { rows: tournamentActivity(mine, results, reviews, identity, Date.now()), tournaments };
    },
  });
  return { userId, rows: userId ? query.data?.rows ?? [] : [], tournaments: query.data?.tournaments ?? [], isError: !!userId && query.isError, refresh: query.refetch };
}

export function unmatchedNames(u: unknown): string[] {
  if (!Array.isArray(u)) return [];
  return u
    .map((x) => (typeof x === "string" ? x : x && typeof x === "object" ? String((x as Record<string, unknown>)["name"] ?? (x as Record<string, unknown>)["player_name"] ?? "") : ""))
    .filter(Boolean);
}
