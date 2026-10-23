import { describe, expect, it } from "vitest";
import { computeLeagueDeltas } from "../src/lib/league-elo";

describe("computeLeagueDeltas", () => {
  it("equal 1000 ratings in a 4-player game give +16/+5.33/-5.33/-16 and only 1st wins", () => {
    const d = computeLeagueDeltas([1, 2, 3, 4].map((p) => ({ player_key: `p${p}`, placement: p, elo: 1000 })));
    expect(d.map((x) => x.elo_delta)).toEqual([16, 5.33, -5.33, -16]);
    expect(d.map((x) => x.won)).toEqual([true, false, false, false]);
  });
});
