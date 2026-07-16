import { supabase } from "@/integrations/supabase/client";
import { TOURNAMENT_MODES } from "@/lib/tournament-config";

/**
 * Detect which tournament a match belongs to by matching player names against
 * `tournament_matches`. Mirrors the server-side backfill in
 * `20260706092337_*.sql`: a tournament is picked when 3+ of the uploaded
 * players are registered in one of its tables.
 *
 * Only tournaments with an entry in TOURNAMENT_MODES are considered so
 * uploads can immediately apply the correct expansion set.
 */
export async function detectTournamentFromPlayers(
  playerNames: Array<string | null | undefined>,
): Promise<number | null> {
  const names = Array.from(
    new Set(
      playerNames
        .map((n) => (n ?? "").trim().toLowerCase())
        .filter((n) => n.length > 0),
    ),
  );
  if (names.length < 3) return null;

  const nums = Object.keys(TOURNAMENT_MODES).map((n) => Number(n));
  if (nums.length === 0) return null;

  const { data, error } = await supabase
    .from("tournament_matches")
    .select("tournament_num, player_name")
    .in("tournament_num", nums);
  if (error || !data) return null;

  const hits = new Map<number, Set<string>>();
  for (const row of data) {
    const key = (row.player_name ?? "").trim().toLowerCase();
    if (!key || !names.includes(key)) continue;
    const set = hits.get(row.tournament_num) ?? new Set<string>();
    set.add(key);
    hits.set(row.tournament_num, set);
  }

  let best: { num: number; count: number } | null = null;
  for (const [num, set] of hits) {
    if (set.size < 3) continue;
    if (!best || set.size > best.count || (set.size === best.count && num > best.num)) {
      best = { num, count: set.size };
    }
  }
  return best?.num ?? null;
}
