import { describe, expect, test } from "bun:test";
import { findRegistration, runSemiSearch, type SemiRegistration, type Standing } from "../src/lib/tournament-semifinals";

const start = new Date("2026-10-14T12:00:00Z");
const iso = (n: number) => new Date(start.getTime() + n * 1_800_000).toISOString();
const pool: Standing[] = ["A", "B", "C", "D"].map((player, i) => ({ player, discord: null, tp: 20, wins: 1, games: 3, avgPlacement: 2, vp: 30, vpPct: 25, rank: i + 1 }));
const regs = (blocks: number[][]): SemiRegistration[] => blocks.map((ns, i) => ({ id: String(i), direwolf_name: pool[i].player, discord_username: null, availability: ns.map(iso), updated_at: iso(0) }));
const run = (availability: number[][], extra = {}) => runSemiSearch({ pool, regs: regs(availability), windowStart: start, windowEnd: new Date(start.getTime() + 4 * 1_800_000), targetSlots: 2, ...extra });

describe("Semi-finals scheduling", () => {
  test("never recommends a player with zero availability", () => {
    const draft = run([[0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3], []]);
    expect(draft?.tables[0].slots).toEqual([]);
    expect(draft?.tables[0].closest).toEqual([]);
  });
  test("full 90 minutes beats a zero-player 120-minute fallback", () => {
    const draft = run([[0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2]], { minPlayerBlocks: 3, minBlocks: 3, maxBlocks: 3 });
    expect(draft?.tables[0].slots[0].blocks).toBe(3);
    expect(draft?.tables[0].slots[0].type).toBe("perfect");
  });
  test("3.25 attendance at 120 minutes outranks full 90 minutes", () => {
    const draft = run([[0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2]]);
    expect(draft?.tables[0].slots[0].blocks).toBe(4);
    expect(draft?.tables[0].slots[0].filled).toBe(15);
    expect(draft?.tables[0].windowCounts[90]).toBe(1);
  });
  test("minimum length and per-player threshold are enforced", () => {
    const draft = run([[0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3], [0]], { minBlocks: 4, minPlayerBlocks: 2 });
    expect(draft?.tables[0].slots).toEqual([]);
  });
  test("unique normalized names match but ambiguous names do not", () => {
    const r = regs([[0], [0], [0], [0]]);
    r[0].direwolf_name = "Abdalah de Bourgogne";
    expect(findRegistration("abdalahdebourgogne", null, r)?.id).toBe("0");
    r[1].direwolf_name = "Abdalah-de-Bourgogne";
    expect(findRegistration("abdalahdebourgogne", null, r)).toBeUndefined();
  });
  test("trial registration overrides provide availability without mutating registrations", () => {
    const r = regs([[0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3]]);
    r[3].direwolf_name = "Old name";
    const draft = runSemiSearch({ pool, regs: r, windowStart: start, windowEnd: new Date(iso(4)), targetSlots: 1, registrationOverrides: { D: "3" } });
    expect(draft?.tables[0].slots[0].type).toBe("perfect");
    expect(r[3].direwolf_name).toBe("Old name");
  });
});