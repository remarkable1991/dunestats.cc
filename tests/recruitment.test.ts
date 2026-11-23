import { describe, expect, it } from "vitest";
import { RECRUIT_EDITIONS, editionStatus, winterPrizePlaces } from "../src/lib/recruitment";

describe("winter recruiter prize places", () => {
  it("starts with top 3", () => expect(winterPrizePlaces(249)).toBe(3));
  it("unlocks 4th place at 250 community points", () => expect(winterPrizePlaces(250)).toBe(4));
  it("unlocks 5th place at 500 community points", () => expect(winterPrizePlaces(500)).toBe(5));
});

describe("winter edition window", () => {
  const w = RECRUIT_EDITIONS.find((e) => e.id === "winter-2026")!;
  it("is active on Dec 31 and finished on Jan 1", () => {
    expect(editionStatus(w, Date.parse("2026-12-31T23:59:00Z"))).toBe("active");
    expect(editionStatus(w, Date.parse("2027-01-01T00:00:00Z"))).toBe("finished");
  });
  it("starts Nov 23, 2026", () => expect(editionStatus(w, Date.parse("2026-11-22T23:00:00Z"))).toBe("upcoming"));
});
