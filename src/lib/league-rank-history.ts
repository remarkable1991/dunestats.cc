export type LeagueRankSnapshot = {
  rank_before: number | null;
  rank_after: number | null;
};

export type LeagueRankGame = {
  gameId: string;
  playedAt: string;
  results: Array<{ playerKey: string; eloDelta: number }>;
};

export type LeagueRankMovement = LeagueRankSnapshot & {
  kind: "new" | "up" | "down" | "same";
  places: number;
};

/** Competition ranking: equal Elo shares a position, with a gap after each tie. */
function standings(state: ReadonlyMap<string, number>) {
  const sorted = [...state.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const ranks = new Map<string, number>();
  let previousElo: number | null = null;
  let previousRank = 0;
  sorted.forEach(([playerKey, elo], index) => {
    const rank = previousElo === elo ? previousRank : index + 1;
    ranks.set(playerKey, rank);
    previousElo = elo;
    previousRank = rank;
  });
  return ranks;
}

/** Replays a season by game date so late-linked historical games affect every later rank. */
export function replayLeagueRankHistory(games: readonly LeagueRankGame[]) {
  const state = new Map<string, number>();
  const snapshots: Record<string, Record<string, LeagueRankSnapshot>> = {};
  const chronological = [...games].sort((a, b) =>
    new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime() || a.gameId.localeCompare(b.gameId));

  for (const game of chronological) {
    const before = standings(state);
    snapshots[game.gameId] = {};
    for (const result of game.results) {
      state.set(result.playerKey, (state.get(result.playerKey) ?? 1000) + result.eloDelta);
    }
    const after = standings(state);
    for (const result of game.results) {
      snapshots[game.gameId][result.playerKey] = {
        rank_before: before.get(result.playerKey) ?? null,
        rank_after: after.get(result.playerKey) ?? null,
      };
    }
  }
  return snapshots;
}

export function leagueRankMovement(rankBefore: number | null, rankAfter: number | null): LeagueRankMovement | null {
  if (rankAfter == null) return null;
  if (rankBefore == null) return { rank_before: null, rank_after: rankAfter, kind: "new", places: 0 };
  const places = rankBefore - rankAfter;
  return {
    rank_before: rankBefore,
    rank_after: rankAfter,
    kind: places > 0 ? "up" : places < 0 ? "down" : "same",
    places: Math.abs(places),
  };
}
