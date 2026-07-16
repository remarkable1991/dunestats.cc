// ============================================================
// TOURNAMENT CONFIG — edit these constants for the next event
// ============================================================
export const TOURNAMENT_NUMBER = 14;
export const TOURNAMENT_START_DATE = "2026-07-14"; // YYYY-MM-DD (local reference)
export const CHECKIN_START_TIME_UTC = "2026-07-13T08:00:00Z"; // 10:00 CET / 11:00 CEST
export const CHECKIN_WINDOW_HOURS = 24;
export const DISCORD_INVITE_URL = "https://discord.gg/WHKV5n7d6a";

// ============================================================
// TOURNAMENT MODE PROFILES
// The active board/expansion configuration for each tournament.
// Used by:
//   - the /tournament landing cards (subtitle + mode badges)
//   - the /upload flow to auto-apply expansions when a match is
//     detected as belonging to a tournament.
// Add a new entry here for every future tournament so uploads auto-tag.
// ============================================================
export type TournamentModeProfile = {
  board_version: "base" | "uprising";
  has_rise_of_ix: boolean;
  has_epic_mode: boolean;
  has_immortality: boolean;
  has_base_leaders: boolean;
  /** Short human-readable subtitle for the landing card, e.g. "Uprising + Immortality · 11 VP". */
  subtitle: string;
};

export const TOURNAMENT_MODES: Record<number, TournamentModeProfile> = {
  13: {
    board_version: "uprising",
    has_rise_of_ix: false,
    has_epic_mode: false,
    has_immortality: false,
    has_base_leaders: false,
    subtitle: "Uprising · 11 VP",
  },
  14: {
    board_version: "uprising",
    has_rise_of_ix: false,
    has_epic_mode: false,
    has_immortality: true,
    has_base_leaders: false,
    subtitle: "Uprising + Immortality · 11 VP",
  },
};

export function tournamentModes(num: number | null | undefined): TournamentModeProfile | null {
  if (num == null) return null;
  return TOURNAMENT_MODES[num] ?? null;
}

export function checkinEndUtc(): Date {
  const start = new Date(CHECKIN_START_TIME_UTC);
  return new Date(start.getTime() + CHECKIN_WINDOW_HOURS * 3600_000);
}

export function tournamentStartUtc(): Date {
  const start = new Date(CHECKIN_START_TIME_UTC);
  return new Date(start.getTime() + 24 * 3600_000);
}

/** First Monday on or after the tournament start date (local time). */
export function firstMondayOfTournament(): Date {
  const [y, m, d] = TOURNAMENT_START_DATE.split("-").map(Number);
  const start = new Date(y, m - 1, d);
  const dow = start.getDay(); // 0=Sun … 1=Mon
  const offset = dow === 1 ? 0 : (1 - dow + 7) % 7;
  start.setDate(start.getDate() + offset);
  start.setHours(0, 0, 0, 0);
  return start;
}

/** Tournament grid start = TOURNAMENT_START_DATE at local 00:00. */
export function tournamentGridStart(): Date {
  const [y, m, d] = TOURNAMENT_START_DATE.split("-").map(Number);
  const start = new Date(y, m - 1, d);
  start.setHours(0, 0, 0, 0);
  return start;
}