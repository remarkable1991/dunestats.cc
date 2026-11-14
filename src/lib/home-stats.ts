import { supabase } from "@/integrations/supabase/client";

const PAGE_SIZE = 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type HomeStats = {
  games: number;
  weekGames: number;
  players: number;
  tournaments: number;
  leagueGames: number;
  leaguePlayers: number;
  lobbies: number;
  weekLobbies: number;
};

export function rollingWeekStart(now: Date): string {
  return new Date(now.getTime() - WEEK_MS).toISOString();
}

/** Tournament history is split across legacy results, matches, logged games and configuration. */
export function hostedTournamentCount(
  ...sources: ReadonlyArray<readonly (number | null | undefined)[]>
): number {
  const nums = new Set<number>();
  for (const source of sources) {
    for (const num of source) {
      if (typeof num === "number" && Number.isInteger(num) && num > 0) nums.add(num);
    }
  }
  return nums.size;
}

export function uniqueLeagueParticipantCount(playerKeys: Iterable<string>): number {
  const players = new Set<string>();
  for (const key of playerKeys) {
    const normalized = key.trim().toLowerCase();
    if (normalized) players.add(normalized);
  }
  return players.size;
}

/** PostgREST caps each response at 1,000 rows regardless of a larger limit. */
async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

export async function fetchHomeStats(now = new Date()): Promise<HomeStats> {
  const weekAgo = rollingWeekStart(now);
  const [
    games,
    players,
    weekGames,
    leagueGames,
    lobbies,
    weekLobbies,
    gameTournaments,
    matchTournaments,
    pastTournaments,
    configuredTournaments,
    leagueRatings,
  ] = await Promise.all([
    supabase.from("games").select("*", { count: "exact", head: true }),
    supabase.from("player_ratings").select("player_key", { count: "exact", head: true }).eq("game_version", "overall"),
    supabase.from("games").select("*", { count: "exact", head: true }).gte("created_at", weekAgo),
    supabase.from("games").select("*", { count: "exact", head: true }).eq("is_league", true),
    supabase.from("active_async_matches").select("id", { count: "exact", head: true }),
    supabase.from("active_async_matches").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
    fetchAllPages<{ tournament_num: number | null }>((from, to) =>
      supabase.from("games").select("tournament_num").not("tournament_num", "is", null).order("id").range(from, to),
    ),
    fetchAllPages<{ tournament_num: number }>((from, to) =>
      supabase.from("tournament_matches").select("tournament_num").order("id").range(from, to),
    ),
    fetchAllPages<{ tournament_num: number }>((from, to) =>
      supabase.from("past_tournament_results").select("tournament_num").order("id").range(from, to),
    ),
    fetchAllPages<{ tournament_num: number }>((from, to) =>
      supabase.from("tournaments").select("tournament_num").order("tournament_num").range(from, to),
    ),
    fetchAllPages<{ player_key: string }>((from, to) =>
      supabase.from("player_league_ratings").select("player_key").order("id").range(from, to),
    ),
  ]);

  for (const result of [games, players, weekGames, leagueGames, lobbies, weekLobbies]) {
    if (result.error) throw result.error;
  }

  return {
    games: games.count ?? 0,
    weekGames: weekGames.count ?? 0,
    players: players.count ?? 0,
    tournaments: hostedTournamentCount(
      gameTournaments.map((row) => row.tournament_num),
      matchTournaments.map((row) => row.tournament_num),
      pastTournaments.map((row) => row.tournament_num),
      configuredTournaments.map((row) => row.tournament_num),
    ),
    leagueGames: leagueGames.count ?? 0,
    leaguePlayers: uniqueLeagueParticipantCount(leagueRatings.map((row) => row.player_key)),
    lobbies: lobbies.count ?? 0,
    weekLobbies: weekLobbies.count ?? 0,
  };
}
