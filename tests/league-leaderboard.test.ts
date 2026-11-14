import { describe, expect, it } from "vitest";
import { rankLeagueLeaderboard, totalLeagueElo, type LeagueLeaderboardRow, type LeagueSortKey } from "../src/lib/league-leaderboard";

const rows: LeagueLeaderboardRow[] = [
  { player_key: "a", elo: 1200, games_played: 4, wins: 4, top2: 4, elo_gained: 210, elo_lost: 10 },
  { player_key: "b", elo: 1100, games_played: 10, wins: 3, top2: 7, elo_gained: 300, elo_lost: 200 },
  { player_key: "c", elo: 1050, games_played: 20, wins: 5, top2: 8, elo_gained: 150, elo_lost: 100 },
];
const rank = (sortKey: LeagueSortKey = "elo", ascending = false, minGames = 0, query = "") =>
  rankLeagueLeaderboard(rows, {}, { sortKey, ascending, minGames, query });

describe("League leaderboard", () => {
  it("renumbers ranks after a minimum-games filter", () => {
    expect(rank("elo", false, 5).map((r) => [r.player_key, r.rank])).toEqual([["b", 1], ["c", 2]]);
  });
  it("renumbers ranks after searching", () => {
    expect(rank("elo", false, 0, "c").map((r) => [r.player_key, r.rank])).toEqual([["c", 1]]);
  });
  it("sums positive ELO independently of losses and ignores zero", () => {
    expect(totalLeagueElo([{ player_key: "a", elo_delta: 12.5 }, { player_key: "a", elo_delta: "7.25" },
      { player_key: "a", elo_delta: -8.5 }, { player_key: "a", elo_delta: -2 }, { player_key: "a", elo_delta: 0 },
      { player_key: "b", elo_delta: -3 }])).toEqual({ a: { elo_gained: 19.75, elo_lost: 10.5 }, b: { elo_gained: 0, elo_lost: 3 } });
  });
  it("sorts greatest gains and losses first, with reversible ordering", () => {
    for (const key of ["elo_gained", "elo_lost"] as const) {
      expect(rank(key).map((r) => [r.player_key, r.rank])).toEqual(key === "elo_gained"
        ? [["b", 1], ["a", 2], ["c", 3]] : [["b", 1], ["c", 2], ["a", 3]]);
      expect(rank(key, true).map((r) => r.player_key)).toEqual(key === "elo_gained" ? ["c", "a", "b"] : ["a", "c", "b"]);
    }
  });
  it("adjusts rank for every existing sortable statistic", () => {
    const expected = { elo: ["a", "b", "c"], games_played: ["c", "b", "a"], wins: ["c", "a", "b"], top2: ["a", "b", "c"], win_pct: ["a", "b", "c"] };
    for (const key of Object.keys(expected) as (keyof typeof expected)[]) {
      expect(rank(key).map((r) => r.player_key)).toEqual(expected[key]);
      expect(rank(key).map((r) => r.rank)).toEqual([1, 2, 3]);
    }
  });
});