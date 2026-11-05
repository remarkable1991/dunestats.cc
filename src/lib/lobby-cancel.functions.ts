import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const OPEN = ["pending_creation", "posting", "searching"];

export type SpPlanLine = { player_key: string; action_type: string; amount: number; moved_to_lobby: string | null };
export type SpPlan = { ok: boolean; lines: SpPlanLine[]; sp_removed: number; sp_moved: number; linked: boolean; status: string };

async function verifyAccess(context: { supabase: any; userId: string }, id: number) {
  const [{ data: lobby, error: lobbyError }, { data: roles, error: rolesError }, { data: links, error: linksError }] = await Promise.all([
    context.supabase.from("active_async_matches").select("id,status,host_id,web_host_id,linked_game_id").eq("id", id).maybeSingle(),
    context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
    context.supabase.from("player_discord_map").select("discord_user_id").eq("claimed_by", context.userId),
  ]);
  if (lobbyError || rolesError || linksError) throw new Error("Could not verify lobby access. Please try again.");
  if (!lobby) throw new Error("Lobby not found or access denied.");
  const admin = ((roles ?? []) as { role: string }[]).some(({ role }) => role === "admin" || role === "lfg_admin");
  const host = lobby.web_host_id === context.userId || ((links ?? []) as { discord_user_id: string | null }[]).some((l) => !!l.discord_user_id && l.discord_user_id === lobby.host_id);
  if (!admin && !host) throw new Error("Only the host or an LFG admin can cancel this lobby.");
  return lobby as { id: number; status: string; host_id: string; linked_game_id: string | null };
}

/** Read-only SP impact for cancelling a started lobby (host or LFG staff). */
export const previewLobbyCancel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.number().int().positive() }))
  .handler(async ({ data, context }) => {
    await verifyAccess(context as never, data.id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: plan, error } = await (supabaseAdmin as any).rpc("lfg_cancel_sp_plan", { p_lobby_id: data.id, p_mode: "preview" });
    if (error) throw new Error(error.message);
    return plan as SpPlan;
  });

export const cancelLobby = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.number().int().positive() }))
  .handler(async ({ data, context }) => {
    const lobby = await verifyAccess(context as never, data.id);
    if (lobby.status === "cancelled") return { ok: true };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (lobby.status === "started") {
      if (lobby.linked_game_id) throw new Error("A result is already linked to this game; ask an admin.");
      const { error } = await (supabaseAdmin as any).rpc("lfg_cancel_sp_plan", { p_lobby_id: data.id, p_mode: "cancel", p_actor: context.userId });
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    if (!OPEN.includes(lobby.status)) throw new Error("This lobby is no longer open for cancellation.");
    const { data: updated, error } = await supabaseAdmin.from("active_async_matches")
      .update({ status: "cancelled", auto_start_at: null })
      .eq("id", data.id).eq("status", lobby.status).eq("host_id", lobby.host_id)
      .select("id").maybeSingle();
    if (error) throw new Error("Could not cancel the lobby. Please try again.");
    if (!updated) throw new Error("The lobby changed. Refresh and try again.");
    return { ok: true };
  });
