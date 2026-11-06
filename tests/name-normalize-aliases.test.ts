import { beforeEach, describe, expect, it, vi } from "vitest";

let aliasRows: Array<{ old_name: string; canonical_name: string }> = [];
let ratingRows: Array<{ display_name: string }> = [];
let ratingRanges: Array<[number, number]> = [];
let aliasRanges: Array<[number, number]> = [];

vi.mock("../src/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const query = {
        order: () => query,
        limit: async () => ({ data: [] }),
        range: async (from: number, to: number) => {
          if (table === "player_name_aliases") {
            aliasRanges.push([from, to]);
            return { data: aliasRows.slice(from, to + 1) };
          }
          if (table === "player_ratings") {
            ratingRanges.push([from, to]);
            return { data: ratingRows.slice(from, to + 1) };
          }
          return { data: [] };
        },
      };
      return { select: () => query };
    },
  },
}));

import { invalidateNameNormalizationCache, normalizeNames } from "../src/lib/name-normalize";

describe("screenshot name aliases", () => {
  beforeEach(() => {
    aliasRows = [{ old_name: "ifcazn", canonical_name: "lfcazn" }];
    ratingRows = [{ display_name: "Valor" }];
    ratingRanges = [];
    aliasRanges = [];
    invalidateNameNormalizationCache();
  });

  it("reuses a confirmed correction on a later screenshot scan", async () => {
    const [row] = await normalizeNames([{ player_name: "ifcazn", placement: 1 }]);
    expect(row.player_name).toBe("lfcazn");
  });

  it("matches the remembered spelling without regard to OCR capitalization", async () => {
    const [row] = await normalizeNames([{ player_name: "IFCAZN", placement: 1 }]);
    expect(row.player_name).toBe("lfcazn");
  });

  it("uses the seated roster to correct an accented OCR spelling", async () => {
    const [row] = await normalizeNames([{ player_name: "Ámenhotep", placement: 4 }], ["Amenhotep"]);
    expect(row.player_name).toBe("Amenhotep");
  });

  it("loads known players beyond the first 1,000-row response", async () => {
    ratingRows = [
      ...Array.from({ length: 1000 }, (_, i) => ({ display_name: `Player ${i}` })),
      { display_name: "Amenhotep" },
    ];
    const [row] = await normalizeNames([{ player_name: "Ámenhotep", placement: 4 }]);
    expect(row.player_name).toBe("Amenhotep");
    expect(ratingRanges).toContainEqual([1000, 1999]);
  });

  it("loads remembered aliases beyond the first 1,000-row response", async () => {
    aliasRows = [
      ...Array.from({ length: 1000 }, (_, i) => ({ old_name: `old-${i}`, canonical_name: `Canonical ${i}` })),
      { old_name: "ámenhotep", canonical_name: "Amenhotep" },
    ];
    const [row] = await normalizeNames([{ player_name: "ÁMENHOTEP", placement: 4 }]);
    expect(row.player_name).toBe("Amenhotep");
    expect(aliasRanges).toContainEqual([1000, 1999]);
  });
});