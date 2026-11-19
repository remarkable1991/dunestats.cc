import { describe, it, expect } from "vitest";
import { findTableSlots } from "../src/lib/tournament-semifinals";

const base = Date.UTC(2030, 0, 1, 12);
const iso = (h: number) => new Date(base + h * 1800_000).toISOString();
const range = (a: number, b: number) => Array.from({ length: b - a }, (_, i) => iso(a + i));

describe("findTableSlots", () => {
  it("prefers a 4/4 window over larger 3/4 windows", () => {
    const av = new Map<string, unknown>([["A", range(0, 60)], ["B", range(0, 60)], ["C", range(0, 60)], ["D", range(40, 44)]]);
    const slots = findTableSlots({ players: ["A", "B", "C", "D"], availability: av, windowStart: new Date(base), windowEnd: new Date(base + 60 * 1800_000) });
    expect(slots[0].type).toBe("perfect");
    expect(slots[0].start).toBe(base + 40 * 1800_000);
    expect(slots[1].type).toBe("near");
    expect(slots[1].missing).toEqual(["D"]);
  });
});
