import { describe, it, expect } from "vitest";
import { translateLeader } from "@/lib/leader-translate";
import { duplicateLeaders } from "@/lib/duplicate-leaders";

describe("Cyrillic leader translation", () => {
  it("maps Ukrainian leader names (ORDOS-CARTHAG-1618)", () => {
    expect(translateLeader("Фейд-Раута Харконнен")).toBe("Feyd-Rautha Harkonnen");
    expect(translateLeader("Леді Марго Фенрінг")).toBe("Lady Margot Fenring");
    expect(translateLeader("Стабан Туек")).toBe("Staban Tuek");
    expect(translateLeader("Гурні Галлек")).toBe("Gurney Halleck");
  });
  it("never defaults unreadable text to a leader", () => {
    expect(translateLeader("Перемога")).toBeNull();
    expect(translateLeader("！！！")).toBeNull();
  });
});

describe("duplicateLeaders", () => {
  it("flags repeated leaders", () => {
    expect(duplicateLeaders(["Paul Atreides", "Paul Atreides", "Staban Tuek", "Lady Jessica"])).toEqual(["Paul Atreides"]);
  });
  it("ignores blanks and unique leaders", () => {
    expect(duplicateLeaders(["Paul Atreides", "", "", "Staban Tuek"])).toEqual([]);
  });
});
