export type MatchSchedule = {
  id: string;
  tournament_num: number;
  round_type: string;
  table_identifier: string;
  match_code: string | null;
  mode: string | null;
  status: string | null;
  votes_count: number | null;
  confirmed_slot: string | null;
  confirmed_time_text: string | null;
  confirmed_timestamp: string | null;
  player_names: string[] | null;
};

export const SCHEDULE_SELECT =
  "id, tournament_num, round_type, table_identifier, match_code, mode, status, votes_count, confirmed_slot, confirmed_time_text, confirmed_timestamp, player_names";

/** Parse an ISO date, a unix timestamp (s or ms) or a loose date string. */
export function parseScheduleTime(s: MatchSchedule | null | undefined): Date | null {
  if (!s) return null;
  const candidates = [s.confirmed_timestamp, s.confirmed_time_text].filter(Boolean) as string[];
  for (const raw of candidates) {
    const v = raw.trim();
    if (!v) continue;
    if (/^\d{9,13}$/.test(v)) {
      const n = Number(v);
      const d = new Date(v.length <= 10 ? n * 1000 : n);
      if (!Number.isNaN(d.getTime())) return d;
      continue;
    }
    // Discord style <t:1712345678:F>
    const m = v.match(/<t:(\d+)(?::[a-zA-Z])?>/);
    if (m) {
      const d = new Date(Number(m[1]) * 1000);
      if (!Number.isNaN(d.getTime())) return d;
      continue;
    }
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

/** e.g. "Mon, Aug 24 · 09:00" in the viewer's local timezone. */
export function formatLocalMatchTime(d: Date): string {
  const day = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${day} · ${time}`;
}

/** Rough "2d 3h" / "45m" style elapsed label. */
export function elapsedSince(d: Date, now: number = Date.now()): string {
  const ms = Math.max(0, now - d.getTime());
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function gcalStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Google Calendar "add event" URL for a match, defaulting to a 2h duration. */
export function googleCalendarUrl(title: string, start: Date, details = "", durationMinutes = 120): string {
  const end = new Date(start.getTime() + durationMinutes * 60000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${gcalStamp(start)}/${gcalStamp(end)}`,
    details,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
