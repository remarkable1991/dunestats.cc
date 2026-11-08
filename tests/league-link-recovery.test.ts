import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import { applyLinkedLeagueElo } from "../src/lib/league-elo.server";

function fixture(ledger: Array<{ player_key: string; season: number }> = [], season: number | null = 1, league = true) {
  const rpc = vi.fn().mockResolvedValue({ error: null });
  const tables: Record<string, unknown> = {
    active_async_matches: { id: 593, is_league: league, linked_game_id: "game-593", season_num: season, season_id: season },
    game_results: ["astateofchance", "OneTwo", "Valor", "mxp01"].map((player_name, index) => ({ player_name, placement: index + 1 })),
    league_match_rating_deltas: ledger,
    player_league_ratings: [],
  };
  const from = (table: string) => {
    const builder = {
      select: () => builder, eq: () => builder, in: () => builder,
      maybeSingle: () => Promise.resolve({ data: tables[table], error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: tables[table], error: null }).then(resolve),
    };
    return builder;
  };
  return { client: { from, rpc } as unknown as SupabaseClient<Database>, rpc };
}

describe("League re-link completion", () => {
  it("restores missing ratings for all four Lobby 593 results in its recorded season", async () => {
    const { client, rpc } = fixture();
    expect(await applyLinkedLeagueElo(client, 593)).toMatchObject({ ok: true, season: 1 });
    expect(rpc).toHaveBeenCalledWith("apply_league_match_ratings", {
      p_game_id: "game-593", p_season: 1,
      p_results: [
        { player_key: "astateofchance", elo_delta: 16, won: true },
        { player_key: "onetwo", elo_delta: 5.33, won: false },
        { player_key: "valor", elo_delta: -5.33, won: false },
        { player_key: "mxp01", elo_delta: -16, won: false },
      ],
    });
  });
  it("does not apply a complete ledger twice", async () => {
    const { client, rpc } = fixture(["astateofchance", "onetwo", "valor", "mxp01"].map((player_key) => ({ player_key, season: 1 })));
    expect(await applyLinkedLeagueElo(client, 593)).toEqual({ ok: true, already: true });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("refuses incomplete contributions instead of reporting success", async () => {
    const { client, rpc } = fixture([{ player_key: "valor", season: 1 }]);
    await expect(applyLinkedLeagueElo(client, 593)).rejects.toThrow("incomplete");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("does not put a historical lobby into today's season when its season is missing", async () => {
    const { client, rpc } = fixture([], null);
    await expect(applyLinkedLeagueElo(client, 593)).rejects.toThrow("no recorded season");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("leaves ordinary lobbies' Elo unchanged", async () => {
    const { client, rpc } = fixture([], 1, false);
    expect(await applyLinkedLeagueElo(client, 593)).toEqual({ ok: false, reason: "not_league" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("surfaces an application failure so re-linking can retry", async () => {
    const { client, rpc } = fixture();
    rpc.mockResolvedValueOnce({ error: { message: "temporarily unavailable" } });
    await expect(applyLinkedLeagueElo(client, 593)).rejects.toThrow("temporarily unavailable");
    expect(await applyLinkedLeagueElo(client, 593)).toMatchObject({ ok: true, season: 1 });
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});