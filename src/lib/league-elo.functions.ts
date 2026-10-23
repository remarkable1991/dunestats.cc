import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeLeagueDeltas, LEAGUE_START } from "@/lib/league-elo";

/** Applies seasonal League Elo once for a League lobby's linked result. Safe to call repeatedly. */
export const applyLeagueEloForLobby = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ lobbyId: z.number().int().positive() }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: lobby } = await supabaseAdmin.from("active_async_matches")
      .select("id,is_league,linked_game_id,season_num,season_id").eq("id", data.lobbyId).maybeSingle();
    if (!lobby?.is_league || !lobby.linked_game_id) return { ok: false, reason: "not_league" };
    const gameId = lobby.linked_game_id;
    const { count } = await supabaseAdmin.from("league_match_rating_deltas").select("game_id", { count: "exact", head: true }).eq("game_id", gameId);
    if (count) return { ok: true, already: true };
    let season = lobby.season_num ?? lobby.season_id ?? null;
    if (!season) {
      const now = new Date().toISOString();
      const { data: s } = await supabaseAdmin.from("sp_seasons").select("id").lte("starts_at", now).gte("ends_at", now).maybeSingle();
      season = s?.id ?? null;
    }
    if (!season) throw new Error("No active League season");
    const { data: results } = await supabaseAdmin.from("game_results").select("player_name,placement").eq("game_id", gameId);
    const rows = (results ?? []).map((r) => ({ player_key: r.player_name.trim().toLowerCase(), placement: r.placement }));
    if (rows.length < 2) return { ok: false, reason: "too_few_results" };
    const { data: ratings } = await supabaseAdmin.from("player_league_ratings").select("player_key,elo")
      .eq("season", season).in("player_key", rows.map((r) => r.player_key));
    const eloOf = new Map((ratings ?? []).map((r) => [r.player_key, Number(r.elo)]));
    const deltas = computeLeagueDeltas(rows.map((r) => ({ ...r, elo: eloOf.get(r.player_key) ?? LEAGUE_START })));
    const { error } = await supabaseAdmin.rpc("apply_league_match_ratings", { p_game_id: gameId, p_season: season, p_results: deltas });
    if (error) {
      if (error.message.includes("already applied")) return { ok: true, already: true };
      throw new Error(error.message);
    }
    return { ok: true, season, deltas };
  });
