import { describe, expect, it } from "vitest";
import { activeRecruitEdition, parseRewardsPath, rewardsSplat } from "@/lib/rewards-path";

describe("rewards paths", () => {
  it("opens the current seasonal ledger by default and for unknown paths", () => {
    expect(parseRewardsPath(undefined)).toEqual({ tab: "seasonal", seasonId: null, editionId: null });
    expect(parseRewardsPath("not-a-ledger")).toEqual({ tab: "seasonal", seasonId: null, editionId: null });
  });

  it("opens lifetime rewards directly", () => {
    expect(parseRewardsPath("lifetime")).toEqual({ tab: "lifetime", seasonId: null, editionId: null });
  });

  it.each(["recruiters-winter2026", "recruiters/winter-2026"])("opens Winter 2026 from %s", (path) => {
    expect(parseRewardsPath(path)).toEqual({ tab: "recruiters", seasonId: null, editionId: "winter-2026" });
  });

  it.each(["recruiters-summer2026", "recruiters/summer-2026"])("opens Summer 2026 from %s", (path) => {
    expect(parseRewardsPath(path)).toEqual({ tab: "recruiters", seasonId: null, editionId: "summer-2026" });
  });

  it("opens the active recruiter competition from the general link", () => {
    const now = Date.parse("2026-11-23T14:00:00Z");
    expect(parseRewardsPath("recruiters", now).editionId).toBe("winter-2026");
    expect(activeRecruitEdition(now).id).toBe("winter-2026");
  });

  it.each(["season-1", "season/1", "seasonal/1"])("opens Season 1 from %s", (path) => {
    expect(parseRewardsPath(path)).toEqual({ tab: "seasonal", seasonId: 1, editionId: null });
  });

  it("builds concise canonical paths", () => {
    expect(rewardsSplat("seasonal")).toBe("seasonal");
    expect(rewardsSplat("seasonal", 1)).toBe("season-1");
    expect(rewardsSplat("lifetime")).toBe("lifetime");
    expect(rewardsSplat("recruiters")).toBe("recruiters");
    expect(rewardsSplat("recruiters", null, "winter-2026")).toBe("recruiters-winter2026");
    expect(rewardsSplat("recruiters", null, "summer-2026")).toBe("recruiters-summer2026");
  });
});
