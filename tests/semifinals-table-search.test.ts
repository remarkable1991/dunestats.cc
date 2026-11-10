import { describe, expect, test } from "bun:test";
import { runSemiSearch, type SemiRegistration, type Standing } from "../src/lib/tournament-semifinals";

const start = new Date("2026-11-16T12:00:00Z");
const iso = (n: number) => new Date(start.getTime() + n * 1_800_000).toISOString();
const standing = (rank: number): Standing => ({ player: `P${rank}`, discord: null, tp: 100 - rank, wins: 0, games: 3, avgPlacement: 2, vp: 30, vpPct: 25, rank });
const registration = (rank: number, blocks: number[]): SemiRegistration => ({ id: String(rank), direwolf_name: `P${rank}`, discord_username: null, availability: blocks.map(iso), updated_at: iso(0) });

describe("table-first semi-final search", () => {
  test("16 players can use non-pot tables such as 1, 2, 15, 16", () => {
    const groups = [[1, 2, 15, 16], [3, 4, 13, 14], [5, 6, 11, 12], [7, 8, 9, 10]];
    const pool = Array.from({ length: 16 }, (_, i) => standing(i + 1));
    const regs = groups.flatMap((group, gi) => group.map((rank) => registration(rank, [gi * 20, gi * 20 + 1])));
    const draft = runSemiSearch({ pool, regs, windowStart: start, windowEnd: new Date(start.getTime() + 80 * 1_800_000), targetSlots: 1, minBlocks: 2, maxBlocks: 2, minPlayerBlocks: 2, minAvgRank: 7, maxAvgRank: 10 });
    expect(draft?.tableCombosTested).toBe(1820);
    expect(draft?.partitionsTested).toBe(1);
    expect(draft?.tables.map((t) => t.players.map((p) => Number(p.slice(1))))).toEqual(groups);
    expect(draft?.tables.every((t) => t.slots.length === 1)).toBe(true);
  });

  test("minimum and maximum average rank are enforced", () => {
    const pool = [1, 2, 15, 16].map(standing);
    const regs = pool.map((p) => registration(p.rank, [0, 1]));
    const options = { pool, regs, windowStart: start, windowEnd: new Date(start.getTime() + 2 * 1_800_000), targetSlots: 1, minBlocks: 2, maxBlocks: 2, minPlayerBlocks: 2 };
    expect(runSemiSearch({ ...options, minAvgRank: 8, maxAvgRank: 9 })?.partitionsTested).toBe(1);
    const rejected = runSemiSearch({ ...options, minAvgRank: 9, maxAvgRank: 10 });
    expect(rejected?.viableTables).toBe(0);
    expect(rejected?.tables).toEqual([]);
  });

  test("two suggestions per table are returned when every split supports them", () => {
    const pool = Array.from({ length: 8 }, (_, i) => standing(i + 1));
    const regs = pool.map((p) => registration(p.rank, [0, 1, 24, 25]));
    const draft = runSemiSearch({ pool, regs, windowStart: start, windowEnd: new Date(start.getTime() + 48 * 1_800_000), targetSlots: 2, minBlocks: 2, maxBlocks: 2, minPlayerBlocks: 2, minAvgRank: 1, maxAvgRank: 8 });
    expect(draft?.partitionsTested).toBe(35);
    expect(draft?.tables).toHaveLength(2);
    expect(draft?.tables.every((t) => t.slots.length === 2)).toBe(true);
  });
});
