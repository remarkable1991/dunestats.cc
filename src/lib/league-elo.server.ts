import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { computeLeagueDeltas, LEAGUE_START } from "@/lib/league-elo";

/** Shared server-side completion step for upload links and administrator re-links. */
export async function applyLinkedLeagueElo(client: SupabaseClient<Database>, lobbyId: number) {
  const { data: lobby, error: lobbyError } = await client.from("active_async_matches")
    .select("id,is_league,linked_game_id,season_num,season_id").eq("id", lobbyId).maybeSingle();
  if (lobbyError) throw new Error(lobbyError.message);
  if (!lobby?.is_league || !lobby.linked_game_id) return { ok: false, reason: "not_league" };
  const gameId = lobby.linked_game_id;
  const season = lobby.season_num ?? lobby.season_id;
  if (!season) throw new Error("This League lobby has no recorded season");
  const { data: results, error: resultError } = await client.from("game_results")
    .select("player_name,placement").eq("game_id", gameId);
  if (resultError) throw new Error(resultError.message);
  const rows = (results ?? []).map((r) => ({ player_key: r.player_name.trim().toLowerCase(), placement: r.placement }));
  if (rows.length < 2) throw new Error("At least two results are required for League ratings");
  const { data: existing, error: ledgerError } = await client.from("league_match_rating_deltas")
    .select("player_key,season").eq("game_id", gameId);
  if (ledgerError) throw new Error(ledgerError.message);
  if (existing?.length) {
    if (existing.length !== rows.length || !rows.every((row) => existing.some((d) => d.player_key === row.player_key && d.season === season))) {
      throw new Error("League rating entries are incomplete or belong to another season; administrator review required");
    }
    return { ok: true, already: true };
  }
  const { data: ratings, error: ratingError } = await client.from("player_league_ratings")
    .select("player_key,elo").eq("season", season).in("player_key", rows.map((r) => r.player_key));
  if (ratingError) throw new Error(ratingError.message);
  const eloOf = new Map((ratings ?? []).map((r) => [r.player_key, Number(r.elo)]));
  const deltas = computeLeagueDeltas(rows.map((r) => ({ ...r, elo: eloOf.get(r.player_key) ?? LEAGUE_START })));
  const { error } = await client.rpc("apply_league_match_ratings", { p_game_id: gameId, p_season: season, p_results: deltas });
  if (error) {
    if (error.message.includes("already applied")) return { ok: true, already: true };
    throw new Error(error.message);
  }
  return { ok: true, season, deltas };
}