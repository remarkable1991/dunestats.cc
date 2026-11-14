import { describe, it, expect } from "vitest";
import { snapToSeatNames } from "@/lib/lobby-manual-result";

describe("snapToSeatNames", () => {
  it("maps a spacing-only variant to the seated spelling", () => {
    expect(snapToSeatNames([{ player_name: "Spellcaster Max" }], ["Spellcastermax"])[0].player_name).toBe("Spellcastermax");
  });
  it("leaves genuinely different names alone", () => {
    expect(snapToSeatNames([{ player_name: "furiDW" }], ["Spellcastermax"])[0].player_name).toBe("furiDW");
  });
});
