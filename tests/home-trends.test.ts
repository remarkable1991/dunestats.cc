import { describe, expect, it } from "vitest";
import { bucketEvents, tournamentTurnout } from "@/lib/home-trends";

const now = new Date("2026-11-26T23:30:00Z");
describe("home trends", () => {
  it("counts games per day over 30 days", () => {
    const pts = bucketEvents([{ at: "2026-11-26T01:00:00Z" }, { at: "2026-11-26T05:00:00Z" }, { at: "2026-11-25T05:00:00Z" }], "day", now);
    expect(pts).toHaveLength(30);
    expect(pts.at(-1)?.value).toBe(2);
    expect(pts.at(-2)?.value).toBe(1);
  });
  it("counts distinct players per bucket and cumulative first appearances", () => {
    const ev = [
      { at: "2026-11-25T05:00:00Z", key: "a" },
      { at: "2026-11-26T05:00:00Z", key: "a" },
      { at: "2026-11-26T06:00:00Z", key: "a" },
      { at: "2026-11-26T06:00:00Z", key: "b" },
    ];
    expect(bucketEvents(ev, "day", now).at(-1)?.value).toBe(2);
    expect(bucketEvents(ev, "day", now, true).map((p) => p.value).slice(-2)).toEqual([1, 2]);
  });
  it("groups peak hours in UTC", () => {
    const pts = bucketEvents([{ at: "2026-11-01T20:10:00Z" }, { at: "2026-11-02T20:50:00Z" }], "hourOfDay", now);
    expect(pts[20]?.value).toBe(2);
  });
  it("counts games per tournament", () => {
    expect(tournamentTurnout([{ tournament_num: 19 }, { tournament_num: 19 }, { tournament_num: null }, { tournament_num: 3 }])).toEqual([
      { label: "T3", value: 1, start: 3 },
      { label: "T19", value: 2, start: 19 },
    ]);
  });
});
