import { describe, expect, it } from "vitest";
import { matchScreenshotToSeats } from "../src/lib/lobby-result-match";

const seat = (name: string, playerKey: string | null, discordHandle: string | null = null) => ({ name, playerKey, discordHandle });

describe("lobby screenshot matching", () => {
  it("is green only when every player is confidently matched", () => {
    const r = matchScreenshotToSeats(["Nevic", "Riven"], [seat("Nevic", "nevic"), seat("Riven", "riven")], { nevic: 12, riven: 3 });
    expect(r.rows.map((x) => x.status)).toEqual(["green", "green"]);
    expect(r.status).toBe("green");
  });

  it("one fuzzy spelling makes that player and the match yellow", () => {
    const r = matchScreenshotToSeats(["Nevic", "Duncraacer"], [seat("Nevic", "nevic"), seat("duncracer", null)], { nevic: 12 });
    expect(r.rows[1].status).toBe("yellow");
    expect(r.status).toBe("yellow");
  });

  it("a veteran missing from the screenshot is orange", () => {
    const r = matchScreenshotToSeats(["Nevic", "Stranger"], [seat("Nevic", "nevic"), seat("Riven", "riven")], { nevic: 12, riven: 9 });
    expect(r.rows[1].status).toBe("orange");
    expect(r.status).toBe("orange");
  });

  it("a screenshot name with no seat at all is orange", () => {
    const r = matchScreenshotToSeats(["Nevic", "Zzz", "Qqq"], [seat("Nevic", "nevic"), seat("Riven", "riven")], { nevic: 12 });
    expect(r.rows.filter((x) => x.status === "orange").length).toBeGreaterThan(0);
    expect(r.status).toBe("orange");
  });
});
