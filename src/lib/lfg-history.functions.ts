import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cleanMatchCode } from "@/lib/lfg-history";
import { SELECT_COLS } from "@/lib/lfg-seats";

export const adminLobbyHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ page: z.number().int().min(0), kind: z.enum(["lobbies", "games"]), status: z.string().max(40), mode: z.enum(["all", "live", "async"]), league: z.enum(["all", "league", "normal"]), search: z.string().max(80) }))
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
    if (data.league !== "all") q = q.eq("is_league", data.league === "league");
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
    return result;
  });

export const revertAdminMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ lobbyId: z.number().int().positive().nullable(), gameId: z.uuid().nullable(), deleteResult: z.boolean(), confirmed: z.literal(true) }))
  .handler(async ({ data, context }) => {
    const { data: admin, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (error || !admin) throw new Error("Main admins only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error: e } = await supabaseAdmin.rpc("admin_revert_match_and_sp", { p_lobby_id: data.lobbyId, p_game_id: data.gameId, p_delete_result: data.deleteResult, p_confirmed: data.confirmed, p_actor: context.userId });
    if (e) throw new Error(e.message);
    return result;
  });