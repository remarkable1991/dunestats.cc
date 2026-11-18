export const SANDBOX_START_ELO = 1000;

export type SandboxMode = "standard" | "vp" | "winner";
export type WinnerLossDistribution = "rated" | "equal";

export type SandboxSettings = {
  mode: SandboxMode;
  k: number;
  scale: number;
  vpSensitivity: number;
  vpCap: number;
  winnerCushion: number;
  winnerLoss: WinnerLossDistribution;
};

export const DEFAULT_SANDBOX_SETTINGS: SandboxSettings = {
  mode: "vp",
  k: 32,
  scale: 400,
  vpSensitivity: 0.12,
  vpCap: 0.3,
  winnerCushion: 0,
  winnerLoss: "rated",
};

export function defaultSandboxSettings(mode: SandboxMode): SandboxSettings {
  return { ...DEFAULT_SANDBOX_SETTINGS, mode };
}

export type SandboxGamePlayer = {
  playerKey: string;
  playerName: string;
  leaderName: string | null;
  points: number;
  placement: number;
  officialDelta: number;
};

export type SandboxGame = {
  gameId: string;
  matchId: string | null;
  playedAt: string;
  lobbyId: number | null;
  results: SandboxGamePlayer[];
};

export type SimulatedPlayer = {
  playerKey: string;
  elo: number;
  games: number;
  wins: number;
  top2: number;
  gained: number;
  lost: number;
  rank: number;
};

export type SimulatedGameResult = SandboxGamePlayer & {
  simulatedDelta: number;
};

export type SimulatedGame = Omit<SandboxGame, "results"> & {
  results: SimulatedGameResult[];
};

const round = (value: number) => Math.round(value * 100) / 100;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function expectedScore(a: number, b: number, scale: number) {
  return 1 / (1 + 10 ** ((b - a) / scale));
}

function pairwiseDeltas(players: SandboxGamePlayer[], ratings: ReadonlyMap<string, number>, settings: SandboxSettings) {
  const n = players.length;
  return players.map((a) => {
    const aElo = ratings.get(a.playerKey) ?? SANDBOX_START_ELO;
    let sum = 0;
    for (const b of players) {
      if (a.playerKey === b.playerKey) continue;
      const bElo = ratings.get(b.playerKey) ?? SANDBOX_START_ELO;
      const expected = expectedScore(aElo, bElo, settings.scale);
      let score: number;
      if (settings.mode === "vp") {
        const base = a.placement < b.placement ? 0.75 : a.placement === b.placement ? 0.5 : 0.25;
        const margin = clamp((a.points - b.points) * settings.vpSensitivity, -settings.vpCap, settings.vpCap);
        score = clamp(base + margin, 0, 1);
      } else {
        score = a.placement < b.placement ? 1 : a.placement === b.placement ? 0.5 : 0;
      }
      sum += score - expected;
    }
    let delta = (settings.k / (n - 1)) * sum;
    const best = Math.min(...players.map((p) => p.placement));
    if (settings.mode === "vp" && a.placement === best && delta < 0) delta = 0;
    return round(delta);
  });
}

/** Zero-sum win shares: expected shares sum to one, and only the winner receives a positive target. */
function winnerTakeAllDeltas(players: SandboxGamePlayer[], ratings: ReadonlyMap<string, number>, settings: SandboxSettings) {
  const n = players.length;
  const expectedShares = players.map((a) => {
    const aElo = ratings.get(a.playerKey) ?? SANDBOX_START_ELO;
    const probabilitySum = players.reduce((sum, b) => {
      if (a.playerKey === b.playerKey) return sum;
      return sum + expectedScore(aElo, ratings.get(b.playerKey) ?? SANDBOX_START_ELO, 400);
    }, 0);
    return (2 / n) * (probabilitySum / (n - 1));
  });
  const best = Math.min(...players.map((p) => p.placement));
  const winners = players.filter((p) => p.placement === best).length;
  const deltas = players.map((p, index) => settings.k * ((p.placement === best ? 1 / winners : 0) - expectedShares[index]));

  if (winners === 1 && settings.winnerLoss === "equal") {
    const winnerIndex = players.findIndex((p) => p.placement === best);
    const winnerGain = deltas[winnerIndex];
    const loss = -winnerGain / (n - 1);
    players.forEach((p, index) => { if (index !== winnerIndex) deltas[index] = loss; });
  }

  if (winners === 1 && settings.winnerCushion > 0) {
    const ordered = [...players].sort((a, b) => a.placement - b.placement);
    if (ordered[1].placement > best) {
      const winnerIndex = players.findIndex((p) => p.placement === best);
      const secondIndex = players.findIndex((p) => p.playerKey === ordered[1].playerKey);
      if (deltas[secondIndex] < 0) {
        const returned = -deltas[secondIndex] * settings.winnerCushion;
        deltas[secondIndex] += returned;
        deltas[winnerIndex] -= returned;
      }
    }
  }
  const rounded = deltas.map(round);
  const roundingResidual = round(rounded.reduce((sum, delta) => sum + delta, 0));
  if (roundingResidual !== 0) {
    const winnerIndex = players.findIndex((player) => player.placement === best);
    rounded[winnerIndex] = round(rounded[winnerIndex] - roundingResidual);
  }
  return rounded;
}

export function computeSandboxGameDeltas(players: SandboxGamePlayer[], ratings: ReadonlyMap<string, number>, settings: SandboxSettings) {
  if (players.length < 2) return [];
  return settings.mode === "winner"
    ? winnerTakeAllDeltas(players, ratings, settings)
    : pairwiseDeltas(players, ratings, settings);
}

/** Replays games by their original play date. It is pure and never reads or writes live ratings. */
export function simulateLeagueSeason(games: readonly SandboxGame[], settings: SandboxSettings) {
  const ratings = new Map<string, number>();
  const players = new Map<string, Omit<SimulatedPlayer, "rank">>();
  const chronological = [...games].sort((a, b) =>
    new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime() || a.gameId.localeCompare(b.gameId));
  const simulatedGames: SimulatedGame[] = [];

  for (const game of chronological) {
    if (game.results.length < 2) continue;
    const deltas = computeSandboxGameDeltas(game.results, ratings, settings);
    const best = Math.min(...game.results.map((p) => p.placement));
    const results = game.results.map((player, index) => {
      const delta = deltas[index];
      const previous = players.get(player.playerKey) ?? {
        playerKey: player.playerKey, elo: SANDBOX_START_ELO, games: 0, wins: 0, top2: 0, gained: 0, lost: 0,
      };
      const next = {
        ...previous,
        elo: previous.elo + delta,
        games: previous.games + 1,
        wins: previous.wins + (player.placement === best ? 1 : 0),
        top2: previous.top2 + (player.placement <= 2 ? 1 : 0),
        gained: previous.gained + Math.max(0, delta),
        lost: previous.lost + Math.max(0, -delta),
      };
      players.set(player.playerKey, next);
      ratings.set(player.playerKey, next.elo);
      return { ...player, simulatedDelta: delta };
    });
    simulatedGames.push({ ...game, results });
  }

  const leaderboard = [...players.values()]
    .sort((a, b) => b.elo - a.elo || a.playerKey.localeCompare(b.playerKey))
    .map((player, index) => ({ ...player, rank: index + 1 }));
  return { leaderboard, games: simulatedGames };
}

export function normalizeSandboxName(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

/** Join screenshot result names to ledger keys without guessing between ambiguous names. */
export function matchSandboxPlayers(
  results: Array<{ player_name: string; placement: number; points: number; leader_name: string | null }>,
  deltas: Array<{ player_key: string; elo_delta: number }>,
  names: Record<string, string>,
): SandboxGamePlayer[] | null {
  if (results.length !== deltas.length || results.length < 2) return null;
  const remaining = new Set(deltas.map((d) => d.player_key));
  const matched: Array<SandboxGamePlayer | null> = results.map(() => null);
  results.forEach((result, index) => {
    const needle = normalizeSandboxName(result.player_name);
    const hits = [...remaining].filter((key) =>
      normalizeSandboxName(key) === needle || normalizeSandboxName(names[key] ?? "") === needle);
    if (hits.length === 1) {
      remaining.delete(hits[0]);
      matched[index] = {
        playerKey: hits[0], playerName: names[hits[0]] ?? result.player_name,
        leaderName: result.leader_name, points: Number(result.points), placement: result.placement,
        officialDelta: Number(deltas.find((d) => d.player_key === hits[0])?.elo_delta ?? 0),
      };
    }
  });
  const unmatched = matched.map((value, index) => value ? -1 : index).filter((index) => index >= 0);
  if (unmatched.length === 1 && remaining.size === 1) {
    const index = unmatched[0];
    const key = [...remaining][0];
    const result = results[index];
    matched[index] = {
      playerKey: key, playerName: names[key] ?? result.player_name,
      leaderName: result.leader_name, points: Number(result.points), placement: result.placement,
      officialDelta: Number(deltas.find((d) => d.player_key === key)?.elo_delta ?? 0),
    };
    remaining.delete(key);
  }
  return remaining.size === 0 && matched.every(Boolean) ? matched as SandboxGamePlayer[] : null;
}
