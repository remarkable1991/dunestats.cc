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
  prizes_summary: string | null;
  prizes_text: string | null;
  registration_open: boolean;
  checkin_start_at: string | null;
  total_players: number | null;
  direct_to_grand_final: number | null;
  to_semifinal: number | null;
  semifinal_tables: number | null;
  grand_final_spots: number | null;
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

/** Check-in opens at the configured time, or 24 hours before the start date. */
export function checkinStart(t: Pick<TournamentConfig, "start_date"> & { checkin_start_at?: string | null }): Date {
  if (t.checkin_start_at) {
    const d = new Date(t.checkin_start_at);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date(parseLocalDate(t.start_date).getTime() - 24 * 3600_000);
}

/** Convert an ISO timestamp to a value for <input type="datetime-local"> in local time. */
export function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Convert a local datetime-local input value to an ISO timestamp. */
export function fromLocalInputValue(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}


/** Format a YYYY-MM-DD date as e.g. "8th of August 2026". */
export function formatLongDate(s: string): string {
  const d = parseLocalDate(s);
  if (Number.isNaN(d.getTime())) return s;
  const day = d.getDate();
  const suffix =
    day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  const month = d.toLocaleDateString("en-GB", { month: "long" });
  return `${day}${suffix} of ${month} ${d.getFullYear()}`;
}

/** Check-in window lasts 24 hours from the check-in start. */
export const CHECKIN_WINDOW_HOURS = 24;

export function checkinEnd(t: Pick<TournamentConfig, "start_date"> & { checkin_start_at?: string | null }): Date {
  return new Date(checkinStart(t).getTime() + CHECKIN_WINDOW_HOURS * 3600_000);
}

/** True while the tournament is inside its 24h check-in window. */
export function isInCheckin(
  t: Pick<TournamentConfig, "start_date"> & { checkin_start_at?: string | null },
  now: number = Date.now(),
): boolean {
  return now >= checkinStart(t).getTime() && now < checkinEnd(t).getTime();
}

export async function fetchCheckinTournaments(): Promise<TournamentConfig[]> {
  const all = await fetchTournaments();
  const now = Date.now();
  return all.filter((t) => isInCheckin(t, now)).sort((a, b) => a.tournament_num - b.tournament_num);
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
  prizes_summary: string | null;
  prizes_text: string | null;
  registration_open: boolean;
  checkin_start_at: string | null;
  total_players: number | null;
  direct_to_grand_final: number | null;
  to_semifinal: number | null;
  semifinal_tables?: number | null;
  grand_final_spots?: number | null;
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
    prizes_summary: row.prizes_summary ?? null,
    prizes_text: row.prizes_text ?? null,
    registration_open: row.registration_open,
    checkin_start_at: row.checkin_start_at ?? null,
    total_players: row.total_players ?? null,
    direct_to_grand_final: row.direct_to_grand_final ?? null,
    to_semifinal: row.to_semifinal ?? null,
  };
}

const SELECT =
  "tournament_num, name, start_date, end_date, required_availability_pct, required_weekly_pct, checkboxes, info_title, info_text, prizes_summary, prizes_text, registration_open, checkin_start_at, total_players, direct_to_grand_final, to_semifinal";

/** Human readable bracket format, e.g. "40 players · 2 straight to Grand Final · 3–10 (8) to Semi Finals". */
export function formatTournamentFormat(
  t: Pick<TournamentConfig, "total_players" | "direct_to_grand_final" | "to_semifinal">,
): string | null {
  const total = t.total_players ?? 0;
  const gf = t.direct_to_grand_final ?? 0;
  const semi = t.to_semifinal ?? 0;
  if (!total || (!gf && !semi)) return null;
  const parts: string[] = [`${total} players`];
  if (gf > 0) parts.push(gf === 1 ? "1st goes straight to the Grand Final" : `Top ${gf} go straight to the Grand Final`);
  if (semi > 0) {
    const from = gf + 1;
    const to = gf + semi;
    parts.push(`${from}\u2013${to} (${semi}) to the Semi Finals`);
  }
  return parts.join(" \u00b7 ");
}

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
