import { describe, expect, it } from "vitest";
import { seasonPrizeAmount, seasonTournamentEligibility } from "@/lib/season-tournament";

describe("season-end registration", () => {
  it("requires at least 10 League games, accepting 10 but not 9", () => {
    const rows = [{ player_key: "player", season: 1, games_played: 9 }];
    expect(seasonTournamentEligibility("Player", 1, 10, rows, ["player"]).eligible).toBe(false);
    expect(seasonTournamentEligibility("Player", 1, 10, [{ ...rows[0], player_key: "player", season: 1, games_played: 10 }], ["player"]).eligible).toBe(true);
  });
  it("does not count other seasons toward the Season 1 requirement", () => {
    expect(seasonTournamentEligibility("player", 1, 10, [{ player_key: "player", season: 2, games_played: 50 }], ["player"])).toEqual({ games: 0, claimed: true, eligible: false });
  });
  it("requires the registration name to belong to the account", () => {
    expect(seasonTournamentEligibility("other", 1, 10, [{ player_key: "other", season: 1, games_played: 50 }], ["player"]).eligible).toBe(false);
  });
  it("uses the current prize allocation total and increases with verified funding", () => {
    expect(seasonPrizeAmount({ tournament_total: "25" })).toBe(25);
    expect(seasonPrizeAmount({ tournament_total: "35" })).toBe(35);
  });
});