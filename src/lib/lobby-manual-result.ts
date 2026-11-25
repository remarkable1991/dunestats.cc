export type LobbyManualRow = {
  placement: number;
  player_name: string;
  leader_name: string;
  points: number;
};

export type LobbyManualSeat = {
  name: string;
  playerKey: string | null;
};

/** Start a manual report in seat order; the reporter only needs to set ranks, leaders and VP. */
export function manualRowsFromSeats(seats: LobbyManualSeat[], unknownName = "Unknown player"): LobbyManualRow[] {
  return seats.slice(0, 4).map((seat, index) => ({
    placement: index + 1,
    player_name: seat.name !== unknownName ? seat.name : (seat.playerKey ?? ""),
    leader_name: "",
    points: 0,
  }));
}

/** Move one result to another rank and keep placements contiguous. */
export function reorderLobbyRows<T extends { placement: number }>(rows: T[], from: number, to: number): T[] {
  const sorted = [...rows].sort((a, b) => a.placement - b.placement);
  if (from === to || from < 0 || to < 0 || from >= sorted.length || to >= sorted.length) return sorted;
  const [moved] = sorted.splice(from, 1);
  sorted.splice(to, 0, moved);
  return sorted.map((row, index) => ({ ...row, placement: index + 1 }));
}

const spaceless = (name: string) => name.trim().toLowerCase().replace(/\s+/g, "");

/** Snap typed names to the seated spelling when they differ only by spacing/case (e.g. "Spellcaster Max" → "Spellcastermax"). */
export function snapToSeatNames<T extends { player_name: string }>(rows: T[], seatNames: string[]): T[] {
  const bySpaceless = new Map(seatNames.filter((n) => n.trim()).map((n) => [spaceless(n), n.trim()]));
  return rows.map((r) => {
    const seat = bySpaceless.get(spaceless(r.player_name));
    return seat && seat !== r.player_name.trim() ? { ...r, player_name: seat } : r;
  });
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length]!;
}

/**
 * Snap names to a table roster. Exact/spacing matches first; then, when exactly one
 * detected name and one roster name are left over and they're close (≤2 edits, e.g.
 * "Cheeses" → "Cheesus"), the leftover is snapped too.
 */
export function snapToRosterNames<T extends { player_name: string }>(rows: T[], roster: string[]): T[] {
  const snapped = snapToSeatNames(rows, roster);
  const used = new Set(snapped.map((r) => spaceless(r.player_name)));
  const leftoverRoster = roster.filter((n) => n.trim() && !used.has(spaceless(n)));
  const rosterSet = new Set(roster.map(spaceless));
  const leftoverIdx = snapped.map((r, i) => (rosterSet.has(spaceless(r.player_name)) ? -1 : i)).filter((i) => i >= 0);
  if (leftoverRoster.length !== 1 || leftoverIdx.length !== 1) return snapped;
  const idx = leftoverIdx[0]!;
  const target = leftoverRoster[0]!;
  if (editDistance(spaceless(snapped[idx]!.player_name), spaceless(target)) > 2) return snapped;
  return snapped.map((r, i) => (i === idx ? { ...r, player_name: target.trim() } : r));
}
