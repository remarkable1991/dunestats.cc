import { supabase } from "@/integrations/supabase/client";
import { knownTournamentNums, loadTournamentModes } from "@/lib/tournament-config";

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

  await loadTournamentModes();
  const nums = knownTournamentNums();
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

export type TournamentCandidate = {
  num: number;
  round: string;
  table: string;
  /** Roster size of the detected table. */
  rosterSize: number;
  /** Detected screenshot names that matched a roster entry. */
  matched: string[];
  /**
   * Screenshot names with no roster entry, paired with the best fuzzy guess
   * from the leftover roster names (null when there is nothing sensible).
   */
  unmatched: Array<{ detected: string; suggested: string | null }>;
  /** Roster names that no screenshot player matched. */
  missingFromScreenshot: string[];
  /** True when every screenshot player matched a roster entry. */
  exact: boolean;
};

function lev(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) dp[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** Loose similarity used for the "did you mean" suggestion (0..1). */
function similarity(a: string, b: string): number {
  const x = a.toLowerCase().replace(/[^a-z0-9]/g, "");
  const y = b.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.startsWith(y.slice(0, 4)) || y.startsWith(x.slice(0, 4))) {
    return 1 - lev(x, y) / Math.max(x.length, y.length) + 0.15;
  }
  return 1 - lev(x, y) / Math.max(x.length, y.length);
}

/**
 * Find the tournament table a screenshot most likely belongs to, tolerating
 * one mis-registered / mis-typed player name (e.g. roster says
 * "jorgenriquez309" but the screenshot shows "JorgEn309").
 */
export async function detectTournamentCandidate(
  playerNames: Array<string | null | undefined>,
): Promise<TournamentCandidate | null> {
  const names = Array.from(
    new Set(playerNames.map((n) => (n ?? "").trim()).filter((n) => n.length > 0)),
  );
  if (names.length < 3) return null;

  await loadTournamentModes();
  const nums = knownTournamentNums();
  if (nums.length === 0) return null;

  const { data } = await supabase
    .from("tournament_matches")
    .select("tournament_num, round_type, table_identifier, player_name")
    .in("tournament_num", nums);
  if (!data) return null;

  const tables = new Map<
    string,
    { num: number; round: string; table: string; roster: string[] }
  >();
  for (const row of data) {
    const key = `${row.tournament_num}::${row.round_type}::${row.table_identifier}`;
    const entry =
      tables.get(key) ??
      {
        num: row.tournament_num,
        round: row.round_type,
        table: row.table_identifier,
        roster: [] as string[],
      };
    const pn = (row.player_name ?? "").trim();
    if (pn) entry.roster.push(pn);
    tables.set(key, entry);
  }

  let best: TournamentCandidate | null = null;
  for (const t of tables.values()) {
    const rosterLeft = [...t.roster];
    const matched: string[] = [];
    const leftovers: string[] = [];
    for (const n of names) {
      const idx = rosterLeft.findIndex((r) => r.toLowerCase() === n.toLowerCase());
      if (idx >= 0) {
        matched.push(rosterLeft[idx]);
        rosterLeft.splice(idx, 1);
      } else {
        leftovers.push(n);
      }
    }
    // Require all but one screenshot player to line up with the roster.
    if (matched.length < names.length - 1 || matched.length < 2) continue;

    const pool = [...rosterLeft];
    const unmatched = leftovers.map((d) => {
      let bestName: string | null = null;
      let bestScore = 0;
      for (const cand of pool) {
        const s = similarity(d, cand);
        if (s > bestScore) {
          bestScore = s;
          bestName = cand;
        }
      }
      if (bestName && bestScore >= 0.4) {
        pool.splice(pool.indexOf(bestName), 1);
        return { detected: d, suggested: bestName };
      }
      return { detected: d, suggested: null };
    });

    const cand: TournamentCandidate = {
      num: t.num,
      round: t.round,
      table: t.table,
      rosterSize: t.roster.length,
      matched,
      unmatched,
      missingFromScreenshot: rosterLeft,
      exact: leftovers.length === 0 && t.roster.length === names.length,
    };
    const score = matched.length * 1000 + (cand.exact ? 500 : 0) + cand.num;
    const bestScore = best ? best.matched.length * 1000 + (best.exact ? 500 : 0) + best.num : -1;
    if (score > bestScore) best = cand;
  }
  return best;
}
