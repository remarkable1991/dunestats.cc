import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { countSeatMatches, lobbyFormat, rankLeagueLobbyCandidates, shouldAutoConfirmLeagueLobby, type LeagueLobbyCandidate } from "@/lib/league-lobby-detect";
import type { LfgRow } from "@/lib/lfg-seats";

const candidate = (id: number, created_at: string, matched: string[]): LeagueLobbyCandidate => ({
  id, matched, row: { id, created_at } as LfgRow,
});

describe("league lobby detection", () => {
  it("matches seated players loosely by name or key", () => {
    const seats = [{ name: "ReMarkable", playerKey: "remarkable" }, { name: "Pablo", playerKey: null }, { name: "Lamora", playerKey: null }];
    expect(countSeatMatches(["Re Markable", "pablo", "Stranger"], seats)).toEqual(["ReMarkable", "Pablo"]);
  });
  it("ranks four-player matches above partial matches and newest first within ties", () => {
    const oldFour = candidate(825, "2026-11-13T05:57:00Z", ["A", "B", "C", "D"]);
    const newFour = candidate(827, "2026-11-13T06:35:00Z", ["A", "B", "C", "D"]);
    const partial = candidate(830, "2026-11-13T07:00:00Z", ["A"]);
    expect(rankLeagueLobbyCandidates([partial, oldFour, newFour]).map((c) => c.id)).toEqual([827, 825, 830]);
  });

  it("auto-confirms only one unambiguous four-player candidate", () => {
    const four = candidate(827, "2026-11-13T06:35:00Z", ["A", "B", "C", "D"]);
    expect(shouldAutoConfirmLeagueLobby([four])).toBe(true);
    expect(shouldAutoConfirmLeagueLobby([four, candidate(825, "2026-11-13T05:57:00Z", ["A"])])).toBe(false);
    expect(shouldAutoConfirmLeagueLobby([candidate(827, "2026-11-13T06:35:00Z", ["A", "B", "C"])])).toBe(false);
  });

  it("reads the lobby format", () => {
    const f = lobbyFormat({ board_type: "Uprising", expansions: ["Immortality"], modules: ["CHOAM"], mode: "live" });
    expect(f).toMatchObject({ board: "uprising", hasImmortality: true, hasIx: false, playMode: "live" });
  });
});
