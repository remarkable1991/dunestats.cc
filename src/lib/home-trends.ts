import { supabase } from "@/integrations/supabase/client";

export type TrendMetric = "games" | "leagueGames" | "players" | "leaguePlayers" | "lobbies" | "tournaments";
export type TrendRange = "hour" | "day" | "week" | "hourOfDay";
export type TrendEvent = { at: string; key?: string };
export type TrendPoint = { label: string; value: number; start: number };

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const RANGE_LABELS: Record<TrendRange, string> = {
  hour: "Hourly · 48h",
  day: "Daily · 30d",
  week: "Weekly · all time",
  hourOfDay: "Peak hours (UTC)",
};

function startOfWeekUtc(ms: number): number {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7; // Monday start
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - day * DAY;
}

function floorTo(ms: number, range: "hour" | "day" | "week"): number {
  if (range === "hour") return Math.floor(ms / HOUR) * HOUR;
  if (range === "day") return Math.floor(ms / DAY) * DAY;
  return startOfWeekUtc(ms);
}

function labelFor(ms: number, range: "hour" | "day" | "week"): string {
  const d = new Date(ms);
  const md = `${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}`;
  return range === "hour" ? `${md} ${String(d.getUTCHours()).padStart(2, "0")}:00` : md;
}

/**
 * Buckets events into contiguous UTC periods. With keys, each bucket counts distinct keys.
 * Cumulative mode counts all events (or first appearances of keys) up to each bucket.
 */
export function bucketEvents(events: TrendEvent[], range: TrendRange, now: Date, cumulative = false): TrendPoint[] {
  const keyed = events.some((e) => e.key);
  if (range === "hourOfDay") {
    const sets = Array.from({ length: 24 }, () => new Set<string>());
    const counts = new Array<number>(24).fill(0);
    events.forEach((e, i) => {
      const h = new Date(e.at).getUTCHours();
      counts[h]! += 1;
      sets[h]!.add(e.key ?? String(i));
    });
    return counts.map((c, h) => ({ label: `${String(h).padStart(2, "0")}:00`, value: keyed ? sets[h]!.size : c, start: h }));
  }
  const nowMs = now.getTime();
  const end = floorTo(nowMs, range);
  let start: number;
  if (range === "hour") start = end - 47 * HOUR;
  else if (range === "day") start = end - 29 * DAY;
  else {
    const first = events.reduce((m, e) => Math.min(m, Date.parse(e.at)), nowMs);
    start = floorTo(first, "week");
  }
  const step = range === "hour" ? HOUR : range === "day" ? DAY : 7 * DAY;
  const starts: number[] = [];
  for (let t = start; t <= end; t += step) starts.push(t);
  const index = new Map(starts.map((t, i) => [t, i]));
  const sets = starts.map(() => new Set<string>());
  const counts = starts.map(() => 0);
  let before = 0;
  const seenBefore = new Set<string>();
  const sorted = [...events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const firstSeen = new Map<string, number>();
  sorted.forEach((e, i) => {
    const ms = Date.parse(e.at);
    const k = e.key ?? `#${i}`;
    if (!firstSeen.has(k)) firstSeen.set(k, ms);
    if (ms < start) {
      before += 1;
      seenBefore.add(k);
      return;
    }
    const idx = index.get(floorTo(ms, range as "hour" | "day" | "week"));
    if (idx == null) return;
    counts[idx]! += 1;
    sets[idx]!.add(k);
  });
  if (!cumulative) {
    return starts.map((t, i) => ({ label: labelFor(t, range), value: keyed ? sets[i]!.size : counts[i]!, start: t }));
  }
  let running = keyed ? seenBefore.size : before;
  const seen = new Set(seenBefore);
  return starts.map((t, i) => {
    if (keyed) {
      for (const k of sets[i]!) if (!seen.has(k)) { seen.add(k); running += 1; }
    } else running += counts[i]!;
    return { label: labelFor(t, range), value: running, start: t };
  });
}

/** Distinct games logged per tournament number, ascending. */
export function tournamentTurnout(games: { tournament_num: number | null }[]): TrendPoint[] {
  const counts = new Map<number, number>();
  for (const g of games) if (typeof g.tournament_num === "number" && g.tournament_num > 0) counts.set(g.tournament_num, (counts.get(g.tournament_num) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([n, v]) => ({ label: `T${n}`, value: v, start: n }));
}

const PAGE = 1000;
async function all<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

export type GameRow = { id: string; created_at: string; is_league: boolean | null; tournament_num: number | null };
const cache = new Map<string, Promise<unknown>>();
function once<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (!cache.has(key)) cache.set(key, fn().catch((e) => { cache.delete(key); throw e; }));
  return cache.get(key) as Promise<T>;
}

const loadGames = () => once("games", () => all<GameRow>((f, t) => supabase.from("games").select("id,created_at,is_league,tournament_num").order("id").range(f, t)));
const loadResults = () => once("results", () => all<{ game_id: string; player_name: string; created_at: string }>((f, t) => supabase.from("game_results").select("game_id,player_name,created_at").order("id").range(f, t)));
const loadLobbies = () => once("lobbies", () => all<{ created_at: string }>((f, t) => supabase.from("active_async_matches").select("id,created_at").order("id").range(f, t)));

export async function loadTrend(metric: TrendMetric): Promise<{ events: TrendEvent[]; turnout?: TrendPoint[] }> {
  if (metric === "lobbies") return { events: (await loadLobbies()).map((r) => ({ at: r.created_at })) };
  const games = await loadGames();
  if (metric === "games") return { events: games.map((g) => ({ at: g.created_at })) };
  if (metric === "leagueGames") return { events: games.filter((g) => g.is_league).map((g) => ({ at: g.created_at })) };
  if (metric === "tournaments") return { events: [], turnout: tournamentTurnout(games) };
  const results = await loadResults();
  const league = new Set(games.filter((g) => g.is_league).map((g) => g.id));
  const rows = metric === "leaguePlayers" ? results.filter((r) => league.has(r.game_id)) : results;
  return { events: rows.map((r) => ({ at: r.created_at, key: r.player_name.trim().toLowerCase() })) };
}
