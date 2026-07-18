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
    .select("tournament_num, round_type, table_identifier, player_name")
    .in("tournament_num", nums);
  if (error || !data) return null;

  const hits = new Map<string, { num: number; players: Set<string> }>();
  for (const row of data) {
    const key = (row.player_name ?? "").trim().toLowerCase();
    if (!key || !names.includes(key)) continue;
    const tableKey = `${row.tournament_num}::${row.round_type}::${row.table_identifier}`;
    const entry = hits.get(tableKey) ?? { num: row.tournament_num, players: new Set<string>() };
    entry.players.add(key);
    hits.set(tableKey, entry);
  }

  let best: { num: number; count: number } | null = null;
  for (const entry of hits.values()) {
    if (entry.players.size !== names.length) continue;
    if (!best || entry.num > best.num) {
      best = { num: entry.num, count: entry.players.size };
    }
  }
  return best?.num ?? null;
}
