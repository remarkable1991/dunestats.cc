import { describe, expect, it } from "vitest";
import {
  DEFAULT_SANDBOX_SETTINGS,
  computeSandboxGameDeltas,
  defaultSandboxSettings,
  matchSandboxPlayers,
  simulateLeagueSeason,
  type SandboxGame,
} from "../src/lib/league-sandbox";

function game(id = "g1", points = [12, 11, 10, 9], playedAt = "2026-11-01T12:00:00Z"): SandboxGame {
  return {
    gameId: id, matchId: id.toUpperCase(), playedAt, lobbyId: 1,
    results: points.map((value, index) => ({
      playerKey: `p${index + 1}`, playerName: `Player ${index + 1}`, leaderName: null,
      points: value, placement: index + 1, officialDelta: 0,
    })),
  };
}

const deltas = (settings = DEFAULT_SANDBOX_SETTINGS, input = game()) =>
  simulateLeagueSeason([input], settings).games[0].results.map((r) => r.simulatedDelta);

describe("League sandbox formulas", () => {
  it("Standard defaults reproduce the official equal-rating placement deltas", () => {
    expect(deltas(defaultSandboxSettings("standard"))).toEqual([16, 5.33, -5.33, -16]);
  });

  it("VP-weighted defaults start with half-strength placement duels before VP margins", () => {
    expect(deltas(DEFAULT_SANDBOX_SETTINGS, game("g1", [10, 10, 10, 10]))).toEqual([8, 2.67, -2.67, -8]);
  });

  it("VP margins reward a dominant win more than a narrow win", () => {
    const narrow = deltas(DEFAULT_SANDBOX_SETTINGS, game("g1", [10, 9, 8, 7]))[0];
    const dominant = deltas(DEFAULT_SANDBOX_SETTINGS, game("g1", [16, 9, 8, 7]))[0];
    expect(dominant).toBeGreaterThan(narrow);
  });

  it("VP margin is capped at the configured 0.30", () => {
    const capped = deltas(DEFAULT_SANDBOX_SETTINGS, game("g1", [20, 10, 10, 10]));
    const beyondCap = deltas(DEFAULT_SANDBOX_SETTINGS, game("g1", [100, 10, 10, 10]));
    expect(beyondCap).toEqual(capped);
  });

  it("VP winner floor prevents a 1400-rated winner from losing Elo against 1000-rated opponents", () => {
    const input = game("g1", [10, 10, 10, 10]);
    const ratings = new Map([["p1", 1400], ["p2", 1000], ["p3", 1000], ["p4", 1000]]);
    const result = computeSandboxGameDeltas(input.results, ratings, DEFAULT_SANDBOX_SETTINGS);
    expect(result[0]).toBe(0);
  });

  it("Winner-Takes-All gives +24 to the winner and -8 to every loser at equal ratings", () => {
    expect(deltas(defaultSandboxSettings("winner"))).toEqual([24, -8, -8, -8]);
  });

  it("A 50% second-place cushion returns four points from winner to runner-up", () => {
    expect(deltas({ ...defaultSandboxSettings("winner"), winnerCushion: 0.5 })).toEqual([20, -4, -8, -8]);
  });

  it("Winner-Takes-All remains zero-sum with unequal ratings and equal loss distribution", () => {
    const input = game();
    const prior = game("prior", [12, 11, 10, 9], "2026-10-01T12:00:00Z");
    const values = simulateLeagueSeason([prior, input], { ...defaultSandboxSettings("winner"), winnerLoss: "equal" }).games.at(-1)!.results;
    expect(values.reduce((sum, row) => sum + row.simulatedDelta, 0)).toBeCloseTo(0, 8);
    expect(new Set(values.slice(1).map((row) => row.simulatedDelta)).size).toBe(1);
  });

  it("Changing a slider does not mutate the source games or official deltas", () => {
    const input = game();
    const before = structuredClone(input);
    simulateLeagueSeason([input], DEFAULT_SANDBOX_SETTINGS);
    expect(input).toEqual(before);
  });
});

describe("League sandbox result matching", () => {
  it("matches accented display names to their ledger keys and retains official deltas", () => {
    const result = matchSandboxPlayers(
      [{ player_name: "Ámenhotep", placement: 1, points: 12, leader_name: "Gurney Halleck" }, { player_name: "Other", placement: 2, points: 10, leader_name: null }],
      [{ player_key: "amenhotep", elo_delta: 12.5 }, { player_key: "other", elo_delta: -12.5 }],
      { amenhotep: "Amenhotep" },
    );
    expect(result?.[0]).toMatchObject({ playerKey: "amenhotep", playerName: "Amenhotep", officialDelta: 12.5 });
  });

  it("rejects ambiguous name matches instead of assigning a result to the wrong player", () => {
    const result = matchSandboxPlayers(
      [{ player_name: "Same", placement: 1, points: 12, leader_name: null }, { player_name: "Other", placement: 2, points: 10, leader_name: null }],
      [{ player_key: "same", elo_delta: 10 }, { player_key: "same ", elo_delta: -10 }],
      {},
    );
    expect(result).toBeNull();
  });
});
