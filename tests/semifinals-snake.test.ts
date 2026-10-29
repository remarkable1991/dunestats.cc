import { describe, expect, it } from "vitest";
import { botCsv, snakeSemiDraft, type Standing } from "@/lib/tournament-semifinals";

const st = (player: string, rank: number): Standing => ({ player, rank, discord: null, tp: 60 - rank, wins: 0, games: 3, avgPlacement: 2, vp: 0, vpPct: 0 });

describe("async snake semi-finals", () => {
  it("seeds 1,4,5,8 vs 2,3,6,7 and pulls the next player in when one is excluded", () => {
    const pool = [3, 4, 5, 6, 7, 8, 10, 11].map((r) => st(`P${r}`, r)); // #9 excluded → #11 joins
    const d = snakeSemiDraft(pool)!;
    expect(d.tables[0].players).toEqual(["P3", "P6", "P7", "P11"]);
    expect(d.tables[1].players).toEqual(["P4", "P5", "P8", "P10"]);
  });
  it("bot CSV has empty slot columns", () => {
    const d = snakeSemiDraft([1, 2, 3, 4].map((r) => st(`P${r}`, r)))!;
    expect(botCsv(17, d, () => null).split("\n")[1].endsWith(',"","",""')).toBe(true);
  });
});
