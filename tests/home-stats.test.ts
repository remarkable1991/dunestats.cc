import { describe, expect, it } from "vitest";
import { hostedTournamentCount, rollingWeekStart, uniqueLeagueParticipantCount } from "../src/lib/home-stats";

describe("home page stats", () => {
  it("counts every hosted tournament across legacy results, logged games, matches and configuration", () => {
    const past = [...Array.from({ length: 12 }, (_, index) => index + 1), 18];
    const loggedGames = [13, 14, 15, 16, 17, 18, 19, 20];
    const matches = [17, 19, 20, 21];
    const configured = [17, 18, 19, 20, 21];

    expect(hostedTournamentCount(past, loggedGames, matches, configured)).toBe(21);
    expect(hostedTournamentCount([12, 18], [13], [13, 20], [20])).toBe(4);
  });

  it("counts a League participant once across seasons and ignores empty keys", () => {
    expect(uniqueLeagueParticipantCount(["Amenhotep", "amenhotep", "riogo", "RIOGO", " ", "maziyt"])).toBe(3);
  });

  it("uses the same exact seven-day cutoff for games and lobbies", () => {
    expect(rollingWeekStart(new Date("2026-11-14T12:14:00.000Z"))).toBe("2026-11-07T12:14:00.000Z");
  });
});
