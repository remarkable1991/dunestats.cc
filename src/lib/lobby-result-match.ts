/** Pure matching of screenshot names to lobby seats, with per-player confidence statuses. */
export type MatchStatus = "green" | "yellow" | "orange";
export type MatchSeat = { name: string; playerKey: string | null; discordHandle: string | null; identityVerified?: boolean };
export type SeatMatch = { rowIndex: number; screenshotName: string; seatIndex: number | null; seatName: string | null; status: MatchStatus; reason: string };
export type MissingVeteran = { seatIndex: number; seatName: string; games: number };
export type MatchReport = { rows: SeatMatch[]; missing: MissingVeteran[]; status: MatchStatus };

/** Players with at least this many recorded games are expected to appear on the screenshot. */
export const VETERAN_GAMES = 5;
export const UNKNOWN_SEAT = "Unknown player";

export const loose = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

function lev(a: string, b: string) {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[b.length];
}
export function similarity(a: string, b: string) {
  const x = loose(a), y = loose(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.length >= 4 && y.length >= 4 && (x.includes(y) || y.includes(x))) return 0.85;
  return 1 - lev(x, y) / Math.max(x.length, y.length);
}

const rank: Record<MatchStatus, number> = { green: 0, yellow: 1, orange: 2 };
export const worst = (list: MatchStatus[]): MatchStatus => list.reduce<MatchStatus>((w, s) => (rank[s] > rank[w] ? s : w), "green");

/**
 * games: recorded game counts by loose player key/name (tournaments + uploads).
 * Green = exact IGN with history/verified link, or Discord name ≥85% similar.
 * Yellow = fuzzy or elimination match. Orange = no seat, or a veteran seat missing / matched only loosely.
 */
export function matchScreenshotToSeats(names: string[], seats: MatchSeat[], games: Record<string, number>): MatchReport {
  const gamesOf = (s: MatchSeat) => Math.max(games[loose(s.playerKey)] ?? 0, games[loose(s.name)] ?? 0);
  const scores: Array<{ r: number; s: number; score: number; exact: boolean; discord: number }> = [];
  names.forEach((n, r) => seats.forEach((seat, s) => {
    const known = seat.name !== UNKNOWN_SEAT;
    const exact = !!loose(n) && (loose(n) === loose(seat.playerKey) || (known && loose(n) === loose(seat.name)));
    const discord = seat.discordHandle ? similarity(n, seat.discordHandle) : 0;
    const fuzzy = Math.max(known ? similarity(n, seat.name) : 0, seat.playerKey ? similarity(n, seat.playerKey) : 0, discord);
    scores.push({ r, s, score: exact ? 1 : fuzzy, exact, discord });
  }));
  scores.sort((a, b) => b.score - a.score);
  const rowSeat = new Map<number, (typeof scores)[number]>();
  const usedSeats = new Set<number>();
  for (const c of scores) {
    if (c.score < 0.5 || rowSeat.has(c.r) || usedSeats.has(c.s)) continue;
    rowSeat.set(c.r, c); usedSeats.add(c.s);
  }
  // Process of elimination: one unmatched row and one unmatched seat left.
  const openRows = names.map((_, i) => i).filter((i) => !rowSeat.has(i) && loose(names[i]));
  const openSeats = seats.map((_, i) => i).filter((i) => !usedSeats.has(i));
  const elimination = openRows.length === 1 && openSeats.length === 1 ? { r: openRows[0], s: openSeats[0] } : null;

  const rows: SeatMatch[] = names.map((n, r) => {
    const c = rowSeat.get(r);
    if (c) {
      const seat = seats[c.s];
      const hist = gamesOf(seat);
      let status: MatchStatus; let reason: string;
      if (c.exact && (hist > 0 || seat.identityVerified)) { status = "green"; reason = hist > 0 ? `Known IGN · ${hist} games` : "Verified link"; }
      else if (c.discord >= 0.85 && hist < VETERAN_GAMES) { status = "green"; reason = "Discord name matches"; }
      else if (hist >= VETERAN_GAMES) { status = "orange"; reason = `${seat.name} has ${hist} games under another name`; }
      else { status = "yellow"; reason = c.exact ? "Name matches, no history yet" : "Close spelling"; }
      return { rowIndex: r, screenshotName: n, seatIndex: c.s, seatName: seat.name, status, reason };
    }
    if (elimination && elimination.r === r) {
      const seat = seats[elimination.s];
      const hist = gamesOf(seat);
      return hist >= VETERAN_GAMES
        ? { rowIndex: r, screenshotName: n, seatIndex: elimination.s, seatName: seat.name, status: "orange", reason: `${seat.name} has ${hist} games but isn't on the screenshot` }
        : { rowIndex: r, screenshotName: n, seatIndex: elimination.s, seatName: seat.name, status: "yellow", reason: "Only remaining seat" };
    }
    return { rowIndex: r, screenshotName: n, seatIndex: null, seatName: null, status: "orange", reason: "Not seated in this lobby" };
  });
  const assigned = new Set(rows.map((x) => x.seatIndex).filter((x): x is number => x != null));
  const missing = seats.flatMap((seat, i) => {
    const g = gamesOf(seat);
    return !assigned.has(i) && g >= VETERAN_GAMES ? [{ seatIndex: i, seatName: seat.name, games: g }] : [];
  });
  const status = worst([...rows.filter((x) => loose(x.screenshotName)).map((x) => x.status), ...(missing.length ? ["orange" as const] : [])]);
  return { rows, missing, status };
}
