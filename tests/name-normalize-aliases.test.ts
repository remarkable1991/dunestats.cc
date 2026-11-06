import { beforeEach, describe, expect, it, vi } from "vitest";

let aliasRows: Array<{ old_name: string; canonical_name: string }> = [];

vi.mock("../src/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: () => {
        if (table === "player_name_aliases") {
          return { order: () => ({ limit: async () => ({ data: aliasRows }) }) };
        }
        const data = table === "player_ratings" ? [{ display_name: "Valor" }] : [];
        return { limit: async () => ({ data }) };
      },
    }),
  },
}));

import { invalidateNameNormalizationCache, normalizeNames } from "../src/lib/name-normalize";

describe("screenshot name aliases", () => {
  beforeEach(() => {
    aliasRows = [{ old_name: "ifcazn", canonical_name: "lfcazn" }];
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
});
