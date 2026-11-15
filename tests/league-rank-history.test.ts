import { describe, expect, it } from "vitest";
import { leagueRankMovement, replayLeagueRankHistory } from "../src/lib/league-rank-history";

const firstGame = {
  gameId: "first",
  playedAt: "2026-11-01T10:00:00Z",
  results: [
    { playerKey: "a", eloDelta: 10 },
    { playerKey: "b", eloDelta: 5 },
    { playerKey: "c", eloDelta: -5 },
    { playerKey: "d", eloDelta: -10 },
  ],
};

describe("League rank history", () => {
  it("marks every player as new in their first recorded game", () => {
    const ranks = replayLeagueRankHistory([firstGame]);
    expect(ranks.first.a).toEqual({ rank_before: null, rank_after: 1 });
    expect(leagueRankMovement(null, 1)?.kind).toBe("new");
  });

  it("shares ranks for equal Elo and leaves a gap after ties", () => {
    const ranks = replayLeagueRankHistory([{ ...firstGame, results: [
      { playerKey: "a", eloDelta: 10 }, { playerKey: "b", eloDelta: 10 },
      { playerKey: "c", eloDelta: -10 }, { playerKey: "d", eloDelta: -10 },
    ] }]);
    expect(ranks.first.a.rank_after).toBe(1);
    expect(ranks.first.b.rank_after).toBe(1);
    expect(ranks.first.c.rank_after).toBe(3);
    expect(ranks.first.d.rank_after).toBe(3);
  });

  it("reports climbed and dropped places from the before/after positions", () => {
    expect(leagueRankMovement(23, 19)).toMatchObject({ kind: "up", places: 4 });
    expect(leagueRankMovement(19, 23)).toMatchObject({ kind: "down", places: 4 });
    expect(leagueRankMovement(19, 19)).toMatchObject({ kind: "same", places: 0 });
  });

  it("replays by game date rather than correction or input order", () => {
    const later = {
      gameId: "later",
      playedAt: "2026-11-02T10:00:00Z",
      results: [
        { playerKey: "a", eloDelta: -20 }, { playerKey: "b", eloDelta: 20 },
        { playerKey: "c", eloDelta: 10 }, { playerKey: "d", eloDelta: -10 },
      ],
    };
    const ranks = replayLeagueRankHistory([later, firstGame]);
    expect(ranks.later.a).toEqual({ rank_before: 1, rank_after: 3 });
    expect(ranks.later.b).toEqual({ rank_before: 2, rank_after: 1 });
    expect(leagueRankMovement(ranks.later.a.rank_before, ranks.later.a.rank_after)).toMatchObject({ kind: "down", places: 2 });
  });

  it("includes players who join after the season has started", () => {
    const newcomerGame = {
      gameId: "newcomer",
      playedAt: "2026-11-03T10:00:00Z",
      results: [
        { playerKey: "a", eloDelta: 10 }, { playerKey: "new", eloDelta: 5 },
        { playerKey: "c", eloDelta: -5 }, { playerKey: "d", eloDelta: -10 },
      ],
    };
    const ranks = replayLeagueRankHistory([firstGame, newcomerGame]);
    expect(ranks.newcomer.new.rank_before).toBeNull();
    expect(ranks.newcomer.new.rank_after).toBe(2);
  });
});
