export const LEAGUE_K = 32;
export const LEAGUE_START = 1000;

export type LeagueEloInput = { player_key: string; placement: number; elo: number };
export type LeagueEloOutput = { player_key: string; elo_delta: number; won: boolean };

/** Pairwise multiplayer Elo: each pair is a mini-match decided by placement, scaled by K/(n-1). */
export function computeLeagueDeltas(players: LeagueEloInput[], k = LEAGUE_K): LeagueEloOutput[] {
  const n = players.length;
  if (n < 2) return [];
  const best = Math.min(...players.map((p) => p.placement));
  return players.map((a) => {
    let sum = 0;
    for (const b of players) {
      if (b === a) continue;
      const expected = 1 / (1 + 10 ** ((b.elo - a.elo) / 400));
      const score = a.placement < b.placement ? 1 : a.placement === b.placement ? 0.5 : 0;
      sum += score - expected;
    }
    return { player_key: a.player_key, elo_delta: Math.round(((k / (n - 1)) * sum) * 100) / 100, won: a.placement === best };
  });
}
