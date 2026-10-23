import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { countSeatMatches, lobbyFormat } from "@/lib/league-lobby-detect";

describe("league lobby detection", () => {
  it("matches seated players loosely by name or key", () => {
    const seats = [{ name: "ReMarkable", playerKey: "remarkable" }, { name: "Pablo", playerKey: null }, { name: "Lamora", playerKey: null }];
    expect(countSeatMatches(["Re Markable", "pablo", "Stranger"], seats)).toEqual(["ReMarkable", "Pablo"]);
  });
  it("reads the lobby format", () => {
    const f = lobbyFormat({ board_type: "Uprising", expansions: ["Immortality"], modules: ["CHOAM"], mode: "live" });
    expect(f).toMatchObject({ board: "uprising", hasImmortality: true, hasIx: false, playMode: "live" });
  });
});
