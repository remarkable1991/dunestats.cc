import { describe, expect, it } from "vitest";
import { snapToRosterNames } from "@/lib/lobby-manual-result";

const roster = ["Cheesus", "Nevic", "Valor", "LordTheRon"];
const rows = (names: string[]) => names.map((player_name, i) => ({ player_name, placement: i + 1 }));

describe("snapToRosterNames", () => {
  it("snaps a single near-miss OCR name to the remaining roster seat", () => {
    expect(snapToRosterNames(rows(["Cheeses", "Nevic", "Valor", "LordTheRon"]), roster).map((r) => r.player_name)).toEqual(roster);
  });
  it("does not snap a clearly different substitute", () => {
    expect(snapToRosterNames(rows(["Zebedee", "Nevic", "Valor", "LordTheRon"]), roster)[0]!.player_name).toBe("Zebedee");
  });
  it("does not guess when two names are unmatched", () => {
    expect(snapToRosterNames(rows(["Cheeses", "Nevik", "Valor", "LordTheRon"]), roster)[0]!.player_name).toBe("Cheeses");
  });
});
