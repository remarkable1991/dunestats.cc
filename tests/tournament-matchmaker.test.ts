import { describe, expect, test } from "bun:test";
import { evaluateQualifierSchedule, runMatchmaker, STRATEGIES, type MatchmakerRegistration, type MatchmakerSettings } from "../src/lib/tournament-matchmaker";

const epoch = Date.parse("2026-10-25T12:00:00Z");
const iso = (block: number) => new Date(epoch + block * 1_800_000).toISOString();
const settings: MatchmakerSettings = {
  startDate: iso(0), cutoffDate: iso(60), targetSlots: 3, maxSeeds: 1,
  stepsPerSeed: 1, checkpointStep: 1, patience: 1, initialTemperature: 120,
  coolingRate: 0.998, startStage: 1, quickProbeSeeds: 0,
};
const registrations = (blocks: number[], count = 4): MatchmakerRegistration[] => Array.from({ length: count }, (_, i) => ({
  id: String(i), user_id: null, direwolf_name: `P${i}`, discord_username: null,
  availability: blocks.map(iso), created_at: iso(0), has_checked_in: true,
  check_in_method: "website", checked_in_at: iso(0),
}));
// Shared players isolate cross-game behavior independently of golfer pairing.
const template = [[[0, 1, 2, 3]], [[0, 1, 2, 3]], [[0, 1, 2, 3]]];
const windows = [0, 20, 40].flatMap((i) => [i, i + 1, i + 2, i + 3]);

describe("Qualifier poll scheduling", () => {
  test("Level 1 permits backup overlaps while keeping all three primaries separate", () => {
    const result = evaluateQualifierSchedule(registrations(windows), settings, template, STRATEGIES[0]);
    expect(result.brokenTables).toBe(0);
    expect(result.tables.map((t) => t.slots[0].index)).toEqual([0, 20, 40]);
    expect(result.tables[1].slots.map((s) => s.index)).toEqual([20, 0, 40]);
    expect(result.tables[2].slots.map((s) => s.index)).toEqual([40, 0, 20]);
  });
  test("Level 2 checks the entire two-hour primary window, not only equal starts", () => {
    const result = evaluateQualifierSchedule(registrations([0, 1, 2, 3, 4, 5]), settings, template.slice(0, 2), STRATEGIES[1]);
    expect(result.tables[0].slots[0].index).toBe(0);
    expect(result.tables[1].slots).toEqual([]);
    expect(result.brokenTables).toBe(1);
  });
  test("Level 3 releases cross-game checks but still requires unanimous two-hour availability", () => {
    const rows = registrations([0, 1, 2, 3]);
    const result = evaluateQualifierSchedule(rows, settings, template, STRATEGIES[2]);
    expect(result.brokenTables).toBe(0);
    expect(result.tables.map((t) => t.slots[0].index)).toEqual([0, 0, 0]);
    rows[3].availability = [iso(0), iso(1), iso(2)];
    expect(evaluateQualifierSchedule(rows, settings, template, STRATEGIES[2]).brokenTables).toBe(3);
  });
  test("relaxing cross-game checks preserves spacing between a table's own options", () => {
    const result = evaluateQualifierSchedule(registrations(Array.from({ length: 12 }, (_, i) => i)), settings, template, STRATEGIES[2]);
    expect(result.tables[0].slots.map((s) => s.index)).toEqual([0, 4, 8]);
  });
  test("the search exhausts primary-only levels before releasing cross-game checks", async () => {
    const previousWindow = globalThis.window;
    Object.assign(globalThis, { window: { setTimeout: globalThis.setTimeout } });
    try {
      const result = await runMatchmaker(registrations([0, 1, 2, 3], 16), settings, () => {}, () => false);
      expect(result?.strategyIndex).toBe(2);
      expect(result?.brokenTables).toBe(0);
      expect(result?.tables).toHaveLength(12);
    } finally {
      Object.assign(globalThis, { window: previousWindow });
    }
  });
});