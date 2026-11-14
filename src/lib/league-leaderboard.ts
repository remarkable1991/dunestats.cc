export type LeagueEloTotals = { elo_gained: number; elo_lost: number };
export type LeagueLeaderboardRow = LeagueEloTotals & {
  player_key: string;
  elo: number;
  games_played: number;
  wins: number;
  top2: number;
};
export type LeagueSortKey = "elo" | "games_played" | "wins" | "top2" | "win_pct" | keyof LeagueEloTotals;

// Loss is stored as a magnitude so descending sorts mean most ELO lost first.
export function totalLeagueElo(deltas: readonly { player_key: string; elo_delta: number | string }[]) {
  const totals: Record<string, LeagueEloTotals> = {};
  for (const delta of deltas) {
    const value = Number(delta.elo_delta);
    const total = totals[delta.player_key] ?? { elo_gained: 0, elo_lost: 0 };
    if (value > 0) total.elo_gained += value;
    if (value < 0) total.elo_lost -= value;
    totals[delta.player_key] = total;
  }
  return totals;
}

export function rankLeagueLeaderboard<T extends LeagueLeaderboardRow>(
  rows: readonly T[], names: Record<string, string>,
  options: { minGames: number; query: string; sortKey: LeagueSortKey; ascending: boolean },
): (T & { rank: number })[] {
  const term = options.query.trim().toLowerCase();
  const value = (row: T) => options.sortKey === "win_pct"
    ? (row.games_played ? row.wins / row.games_played : 0)
    : options.sortKey === "top2"
      ? (row.games_played ? row.top2 / row.games_played : 0)
      : row[options.sortKey];
  return rows.filter((row) => row.games_played >= Math.max(options.minGames, 1)
    && (!term || row.player_key.toLowerCase().includes(term) || (names[row.player_key] ?? "").toLowerCase().includes(term)))
    .sort((a, b) => (options.ascending ? value(a) - value(b) : value(b) - value(a))
      || a.player_key.localeCompare(b.player_key))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}