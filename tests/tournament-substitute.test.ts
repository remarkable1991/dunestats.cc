import { describe, expect, it } from "vitest";
import { applyReplacement, candidateFit, remainingSlotTallies } from "../src/lib/tournament-substitute";

const sched = {
  player_names: ["A", "B", "C", "D"],
  player_discord_ids: ["1", "2", "3", "4"],
  votes: { "1": ["🇦"], "2": ["🇦", "🇧"], "3": ["🇦"], "4": ["🇧"] },
  suggested_slots: [
    { label: "🇦", time_text: "<t:1800000000:F>" },
    { label: "🇧", time_text: "<t:1800036000:F>" },
  ],
};

describe("tournament substitute", () => {
  it("wipes only the replaced player's votes and gives the newcomer none", () => {
    const r = applyReplacement(sched, 3, "99", "E");
    expect(r.player_discord_ids).toEqual(["1", "2", "3", "99"]);
    expect(r.player_names).toEqual(["A", "B", "C", "E"]);
    expect(r.votes).toEqual({ "1": ["🇦"], "2": ["🇦", "🇧"], "3": ["🇦"] });
    expect(r.votes_count).toBe(3);
    expect(r.status).toBe("pending_votes");
  });

  it("counts votes from the remaining three only", () => {
    expect(remainingSlotTallies(sched, 3).map((t) => t.yes)).toEqual([3, 1]);
  });

  it("checks every suggested slot equally", () => {
    const tallies = remainingSlotTallies(sched, 3);
    const freeAtB = [0, 1, 2, 3].map((k) => new Date((1800036000 + k * 1800) * 1000).toISOString());
    expect(candidateFit(freeAtB, [[], [], []], tallies)).toEqual({ fit: "partial", slots: ["🇧"] });
    const freeAtA = [0, 1, 2, 3].map((k) => new Date((1800000000 + k * 1800) * 1000).toISOString());
    expect(candidateFit(freeAtA, [[], [], []], tallies).fit).toBe("perfect");
    expect(candidateFit([], [[], [], []], tallies).fit).toBe("none");
  });
});
