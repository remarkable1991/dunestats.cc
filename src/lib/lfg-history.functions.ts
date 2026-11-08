import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cleanMatchCode } from "@/lib/lfg-history";
import { SELECT_COLS } from "@/lib/lfg-seats";

export const adminLobbyHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ page: z.number().int().min(0), kind: z.enum(["lobbies", "games"]), status: z.string().max(40), mode: z.enum(["all", "live", "async"]), league: z.enum(["all", "league", "normal", "unreported"]), search: z.string().max(80) }))
  .handler(async ({ data, context }) => {
    const { data: roles, error } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (error || !roles?.some((r) => ["admin", "lfg_admin"].includes(r.role))) throw new Error("LFG admins only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const start = data.page * 20;
    const term = cleanMatchCode(data.search).replace(/[^a-zA-Z0-9 -]/g, "");
    if (data.kind === "games") {
      let q = supabaseAdmin.from("games").select("id,public_match_id,created_at,play_mode,is_league,game_version", { count: "exact" });
      if (data.mode !== "all") q = q.eq("play_mode", data.mode);
      if (data.league !== "all") q = q.eq("is_league", data.league === "league");
      if (term) q = q.ilike("public_match_id", `%${term}%`);
      const { data: games, error: e, count } = await q.order("created_at", { ascending: false }).range(start, start + 19);
      if (e) throw new Error("Could not load match history");
      const ids = (games ?? []).map((g) => g.id);
      const [{ data: results }, { data: events }, { data: links }] = ids.length ? await Promise.all([
        supabaseAdmin.from("game_results").select("game_id,player_name,elo_delta,elo_delta_overall").in("game_id", ids),
        supabaseAdmin.from("sp_events").select("id,player_key,amount,action_type,ref_game_id,metadata").in("ref_game_id", ids),
        supabaseAdmin.from("active_async_matches").select("id,linked_game_id").in("linked_game_id", ids),
      ]) : [{ data: [] }, { data: [] }, { data: [] }];
      return { kind: "games" as const, rows: games ?? [], results: results ?? [], events: events ?? [], links: links ?? [], count: count ?? 0 };
    }
    let q = supabaseAdmin.from("active_async_matches").select(SELECT_COLS, { count: "exact" });
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.mode !== "all") q = q.eq("mode", data.mode);
    if (data.league === "unreported") q = q.eq("is_league", true).eq("status", "started").is("linked_game_id", null);
    else if (data.league !== "all") q = q.eq("is_league", data.league === "league");
    if (term) q = /^\d+$/.test(term) ? q.eq("id", Number(term)) : q.ilike("match_id", `%${term}%`);
    const { data: rows, error: e, count } = await q.order("created_at", { ascending: false }).range(start, start + 19);
    if (e) throw new Error("Could not load lobby history");
    const ids = (rows ?? []).map((r) => String(r.id));
    const gameIds = (rows ?? []).flatMap((r) => r.linked_game_id ? [r.linked_game_id] : []);
    const [{ data: startEvents }, { data: gameEvents }, { data: games }] = await Promise.all([
      ids.length ? supabaseAdmin.from("sp_events").select("id,player_key,amount,action_type,ref_game_id,metadata").in("metadata->>match_id", ids).in("action_type", ["match_start_base", "first_live_game", "first_weekly_async"]) : Promise.resolve({ data: [] }),
      gameIds.length ? supabaseAdmin.from("sp_events").select("id,player_key,amount,action_type,ref_game_id,metadata").in("ref_game_id", gameIds) : Promise.resolve({ data: [] }),
      gameIds.length ? supabaseAdmin.from("games").select("id,public_match_id").in("id", gameIds) : Promise.resolve({ data: [] }),
    ]);
    return { kind: "lobbies" as const, rows: rows ?? [], events: [...(startEvents ?? []), ...(gameEvents ?? [])], games: games ?? [], count: count ?? 0 };
  });

export const linkAdminLobby = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ lobbyId: z.number().int().positive(), matchCode: z.string().max(80) }))
  .handler(async ({ data, context }) => {
    const { data: roles, error } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (error || !roles?.some((r) => ["admin", "lfg_admin"].includes(r.role))) throw new Error("LFG admins only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error: e } = await supabaseAdmin.rpc("admin_link_lobby_match", { p_lobby_id: data.lobbyId, p_match_code: cleanMatchCode(data.matchCode), p_actor: context.userId });
    if (e) throw new Error(e.message);
    if (cleanMatchCode(data.matchCode)) {
      const { applyLinkedLeagueElo } = await import("@/lib/league-elo.server");
      try {
        await applyLinkedLeagueElo(supabaseAdmin, data.lobbyId);
      } catch (error) {
        console.error("League ratings after admin link failed:", error);
        throw new Error("Match linked, but League ratings could not be completed. Retry linking the same match to finish applying its ratings.");
      }
    }
    return result;
  });

export const revertAdminMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ lobbyId: z.number().int().positive().nullable(), gameId: z.uuid().nullable(), deleteResult: z.boolean(), confirmed: z.literal(true) }))
  .handler(async ({ data, context }) => {
    const { data: admin, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (error || !admin) throw new Error("Main admins only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error: e } = await supabaseAdmin.rpc("admin_revert_match_and_sp", { p_lobby_id: data.lobbyId ?? undefined, p_game_id: data.gameId ?? undefined, p_delete_result: data.deleteResult, p_confirmed: data.confirmed, p_actor: context.userId });
    if (e) throw new Error(e.message);
    return result;
  });
async function requireLfgAdmin(context: { supabase: { from: (t: "user_roles") => any }; userId: string }) {
  const { data: roles, error } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  if (error || !(roles as { role: string }[] | null)?.some((r) => ["admin", "lfg_admin"].includes(r.role))) throw new Error("LFG admins only");
}

/** Admin unlink with three outcomes: delete match, back to League waiting for screenshot, or casual game. */
export const unlinkLobbyResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ lobbyId: z.number().int().positive(), mode: z.enum(["delete", "league_pending", "casual"]) }))
  .handler(async ({ data, context }) => {
    await requireLfgAdmin(context as never);
    if (data.mode === "delete") {
      const { data: admin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
      if (!admin) throw new Error("Only main admins can fully delete a match");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.mode === "delete") {
      // Move daily/weekly first-game bonuses to the player's next game before the start SP is reverted.
      const { error: re } = await (supabaseAdmin as any).rpc("lfg_cancel_sp_plan", { p_lobby_id: data.lobbyId, p_mode: "reassign", p_actor: context.userId });
      if (re) throw new Error(re.message);
    }
    const { data: result, error } = await (supabaseAdmin as any).rpc("admin_unlink_lobby", { p_lobby_id: data.lobbyId, p_mode: data.mode, p_actor: context.userId });
    if (error) throw new Error(error.message);
    return result as { ok: boolean };
  });

export const promoteLobbyToLeague = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ lobbyId: z.number().int().positive() }))
  .handler(async ({ data, context }) => {
    await requireLfgAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await (supabaseAdmin as any).rpc("admin_promote_lobby_league", { p_lobby_id: data.lobbyId, p_actor: context.userId });
    if (error) throw new Error(error.message);
    return result as { ok: boolean };
  });

/** Saves confirmed seat Discord ID ↔ IGN pairs after a lobby result is linked; never overwrites existing mappings. */
export const recordResultIdentities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ lobbyId: z.number().int().positive(), pairs: z.array(z.object({ discord_user_id: z.string().max(40).nullable().optional(), seat_name: z.string().max(60).nullable().optional(), player_name: z.string().max(60) })).max(6) }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await (supabaseAdmin as any).rpc("lfg_record_result_identities", { p_lobby_id: data.lobbyId, p_pairs: data.pairs });
    if (error) throw new Error(error.message);
    return result as { ok: boolean; mapped?: number; changes?: { kind: string; from?: string; to: string }[] };
  });

const loose = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Candidate uploaded matches for an unreported lobby: games uploaded on the lobby's day (UTC, plus the next day) sharing at least one player name. */
export const findLobbyCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ lobbyId: z.number().int().positive() }))
  .handler(async ({ data, context }) => {
    await requireLfgAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: lobby, error: lobbyError } = await supabaseAdmin.from("active_async_matches").select(SELECT_COLS).eq("id", data.lobbyId).single();
    if (lobbyError || !lobby) throw new Error("Lobby not found");
    const created = new Date(lobby.created_at);
    const start = new Date(Date.UTC(created.getUTCFullYear(), created.getUTCMonth(), created.getUTCDate()));
    const end = new Date(start.getTime() + 2 * 86_400_000);
    const { data: games, error: gamesError } = await supabaseAdmin
      .from("games")
      .select("id,public_match_id,created_at,is_league,play_mode,game_version")
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString())
      .order("created_at", { ascending: true });
    if (gamesError) throw new Error("Could not load candidate matches");
    const ids = (games ?? []).map((g) => g.id);
    type Candidate = { id: string; code: string | null; createdAt: string; isLeague: boolean | null; playMode: string | null; players: string[]; matched: string[] };
    if (!ids.length) return { candidates: [] as Candidate[] };
    const [{ data: results }, { data: links }] = await Promise.all([
      supabaseAdmin.from("game_results").select("game_id,player_name").in("game_id", ids),
      supabaseAdmin.from("active_async_matches").select("linked_game_id").in("linked_game_id", ids),
    ]);
    const linkedElsewhere = new Set((links ?? []).map((l) => l.linked_game_id).filter(Boolean));
    const discordIds = [...new Set([...(lobby.player_ids ?? []), lobby.host_id].filter(Boolean))];
    const { data: maps } = discordIds.length
      ? await supabaseAdmin.from("player_discord_map").select("player_key,display_name,discord_username").in("discord_user_id", discordIds)
      : { data: [] };
    const seatKeys = new Set(
      [
        ...(lobby.expected_player_keys ?? []),
        ...(lobby.guest_players ?? []),
        ...(lobby.web_player_names ?? []),
        ...(lobby.discord_usernames ?? []),
        ...(maps ?? []).flatMap((m) => [m.player_key, m.display_name, m.discord_username]),
      ]
        .map((n) => loose(n ?? ""))
        .filter(Boolean),
    );
    const byGame = new Map<string, string[]>();
    for (const r of results ?? []) byGame.set(r.game_id, [...(byGame.get(r.game_id) ?? []), r.player_name]);
    const candidates = (games ?? [])
      .filter((g) => !linkedElsewhere.has(g.id))
      .map((g) => {
        const players = byGame.get(g.id) ?? [];
        const matched = players.filter((p) => seatKeys.has(loose(p)));
        return { id: g.id, code: g.public_match_id, createdAt: g.created_at, isLeague: g.is_league, playMode: g.play_mode, players, matched };
      })
      .filter((c) => c.matched.length > 0)
      .sort((a, b) => b.matched.length - a.matched.length)
      .slice(0, 10);
    return { candidates };
  });

/** Replaces a seated player name on a lobby and optionally moves its start SP awards to the new player. */
export const substituteLobbyPlayer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ lobbyId: z.number().int().positive(), oldKey: z.string().min(1).max(60), newKey: z.string().min(1).max(60), transferSp: z.boolean() }))
  .handler(async ({ data, context }) => {
    await requireLfgAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await (supabaseAdmin as any).rpc("lfg_admin_substitute_player", {
      p_lobby_id: data.lobbyId,
      p_old_key: data.oldKey,
      p_new_key: data.newKey,
      p_transfer_sp: data.transferSp,
      p_actor: context.userId,
    });
    if (error) throw new Error(error.message);
    return result as { ok: boolean; sp_awards_moved?: number };
  });
