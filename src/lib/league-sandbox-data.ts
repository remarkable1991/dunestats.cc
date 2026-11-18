import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { matchSandboxPlayers, type SandboxGame } from "@/lib/league-sandbox";

export type OfficialLeaguePlayer = {
  playerKey: string;
  elo: number;
  games: number;
  wins: number;
};

export type LeagueSandboxDataset = {
  games: SandboxGame[];
  official: OfficialLeaguePlayer[];
  names: Record<string, string>;
  skippedGames: number;
};

type DeltaRow = { game_id: string; player_key: string; elo_delta: number };
type GameResultRow = { player_name: string; placement: number; points: number; leader_name: string | null };
type GameRow = { id: string; public_match_id: string | null; created_at: string; game_results: GameResultRow[] };

export const sandboxSeasonsQuery = queryOptions({
  queryKey: ["league-sandbox-seasons"],
  staleTime: 5 * 60_000,
  queryFn: async () => {
    const { data, error } = await supabase.from("player_league_ratings").select("season").order("season", { ascending: false }).limit(1000);
    if (error) throw new Error(error.message);
    return [...new Set((data ?? []).map((row) => row.season))].sort((a, b) => b - a);
  },
});

async function fetchDeltas(season: number) {
  const rows: DeltaRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("league_match_rating_deltas")
      .select("game_id,player_key,elo_delta").eq("season", season)
      .order("game_id").order("player_key").range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

async function fetchOfficial(season: number): Promise<OfficialLeaguePlayer[]> {
  const rows: OfficialLeaguePlayer[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("player_league_ratings")
      .select("player_key,elo,games_played,wins").eq("season", season)
      .order("player_key").range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []).map((row) => ({ playerKey: row.player_key, elo: Number(row.elo), games: row.games_played, wins: row.wins })));
    if (!data || data.length < 1000) return rows;
  }
}

export async function loadLeagueSandbox(season: number): Promise<LeagueSandboxDataset> {
  const [deltas, official] = await Promise.all([fetchDeltas(season), fetchOfficial(season)]);
  const gameIds = [...new Set(deltas.map((row) => row.game_id))];
  const playerKeys = [...new Set([...deltas.map((row) => row.player_key), ...official.map((row) => row.playerKey)])];
  const names: Record<string, string> = {};
  const gameRows: GameRow[] = [];
  const lobbyByGame = new Map<string, number>();

  await Promise.all([
    (async () => {
      for (let i = 0; i < playerKeys.length; i += 150) {
        const { data, error } = await supabase.from("player_ratings")
          .select("player_key,display_name").eq("game_version", "overall").in("player_key", playerKeys.slice(i, i + 150));
        if (error) throw new Error(error.message);
        for (const row of data ?? []) names[row.player_key] = row.display_name;
      }
    })(),
    (async () => {
      for (let i = 0; i < gameIds.length; i += 75) {
        const { data, error } = await supabase.from("games")
          .select("id,public_match_id,created_at,game_results(player_name,placement,points,leader_name)")
          .in("id", gameIds.slice(i, i + 75));
        if (error) throw new Error(error.message);
        gameRows.push(...((data ?? []) as unknown as GameRow[]));
      }
    })(),
    (async () => {
      for (let i = 0; i < gameIds.length; i += 150) {
        const { data, error } = await supabase.from("active_async_matches")
          .select("id,linked_game_id").in("linked_game_id", gameIds.slice(i, i + 150));
        if (error) throw new Error(error.message);
        for (const row of data ?? []) if (row.linked_game_id) lobbyByGame.set(row.linked_game_id, row.id);
      }
    })(),
  ]);

  const deltasByGame = new Map<string, DeltaRow[]>();
  for (const delta of deltas) deltasByGame.set(delta.game_id, [...(deltasByGame.get(delta.game_id) ?? []), delta]);
  const games: SandboxGame[] = [];
  let skippedGames = 0;
  for (const game of gameRows) {
    const results = matchSandboxPlayers(game.game_results, deltasByGame.get(game.id) ?? [], names);
    if (!results) { skippedGames += 1; continue; }
    games.push({ gameId: game.id, matchId: game.public_match_id, playedAt: game.created_at, lobbyId: lobbyByGame.get(game.id) ?? null, results });
  }
  skippedGames += Math.max(0, gameIds.length - gameRows.length);
  return { games, official, names, skippedGames };
}

export const leagueSandboxQuery = (season: number) => queryOptions({
  queryKey: ["league-sandbox", season],
  queryFn: () => loadLeagueSandbox(season),
  staleTime: 5 * 60_000,
});
