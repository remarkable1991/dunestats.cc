import { supabase } from "@/integrations/supabase/client";

export type TournamentCheckbox = { id: string; label: string };

export type TournamentConfig = {
  tournament_num: number;
  name: string;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  required_availability_pct: number;
  required_weekly_pct: number;
  checkboxes: TournamentCheckbox[];
  info_title: string | null;
  info_text: string | null;
  registration_open: boolean;
};

export const MAX_CHECKBOXES = 4;
export const SLOTS_PER_DAY = 48; // 30-minute blocks

/** Parse a YYYY-MM-DD date into a local Date at 00:00. */
export function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

/** Inclusive number of days between start and end date. */
export function tournamentDayCount(t: Pick<TournamentConfig, "start_date" | "end_date">): number {
  const start = parseLocalDate(t.start_date).getTime();
  const end = parseLocalDate(t.end_date).getTime();
  const days = Math.floor((end - start) / 86400000) + 1;
  return Math.min(Math.max(days, 1), 84);
}

/** Number of (possibly partial) 7-day weeks in the availability grid. */
export function tournamentWeekCount(t: Pick<TournamentConfig, "start_date" | "end_date">): number {
  return Math.ceil(tournamentDayCount(t) / 7);
}

/** Check-in opens 24 hours before the tournament start date. */
export function checkinStart(t: Pick<TournamentConfig, "start_date">): Date {
  return new Date(parseLocalDate(t.start_date).getTime() - 24 * 3600_000);
}

/** Registration closes 24 hours after the start date. */
export function registrationClosesAt(t: Pick<TournamentConfig, "start_date">): Date {
  return new Date(parseLocalDate(t.start_date).getTime() + 24 * 3600_000);
}

export function isRegistrationOpen(t: TournamentConfig, now: number = Date.now()): boolean {
  return t.registration_open && now < registrationClosesAt(t).getTime();
}

type Row = {
  tournament_num: number;
  name: string;
  start_date: string;
  end_date: string;
  required_availability_pct: number | string;
  required_weekly_pct: number | string;
  checkboxes: unknown;
  info_title: string | null;
  info_text: string | null;
  registration_open: boolean;
};

export function normalizeTournament(row: Row): TournamentConfig {
  const boxes = Array.isArray(row.checkboxes) ? row.checkboxes : [];
  return {
    tournament_num: row.tournament_num,
    name: row.name,
    start_date: row.start_date,
    end_date: row.end_date,
    required_availability_pct: Number(row.required_availability_pct) || 0,
    required_weekly_pct: Number(row.required_weekly_pct) || 0,
    checkboxes: boxes
      .filter((b): b is TournamentCheckbox => !!b && typeof b === "object" && "label" in (b as object))
      .map((b, i) => ({ id: String(b.id ?? `c${i}`), label: String(b.label ?? "") }))
      .filter((b) => b.label.trim().length > 0)
      .slice(0, MAX_CHECKBOXES),
    info_title: row.info_title,
    info_text: row.info_text,
    registration_open: row.registration_open,
  };
}

const SELECT =
  "tournament_num, name, start_date, end_date, required_availability_pct, required_weekly_pct, checkboxes, info_title, info_text, registration_open";

export async function fetchTournaments(): Promise<TournamentConfig[]> {
  const { data, error } = await supabase
    .from("tournaments")
    .select(SELECT)
    .order("tournament_num", { ascending: false });
  if (error || !data) return [];
  return (data as unknown as Row[]).map(normalizeTournament);
}

export async function fetchOpenTournaments(): Promise<TournamentConfig[]> {
  const all = await fetchTournaments();
  const now = Date.now();
  return all.filter((t) => isRegistrationOpen(t, now)).sort((a, b) => a.tournament_num - b.tournament_num);
}
