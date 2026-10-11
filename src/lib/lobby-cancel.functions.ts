import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const cancelLobby = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.number().int().positive() }))
  .handler(async ({ data, context }) => {
    const [{ data: lobby, error: lobbyError }, { data: roles, error: rolesError }, { data: links, error: linksError }] = await Promise.all([
      context.supabase.from("active_async_matches").select("id,status,host_id,web_host_id").eq("id", data.id).maybeSingle(),
      context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
      context.supabase.from("player_discord_map").select("discord_user_id").eq("claimed_by", context.userId),
    ]);
    if (lobbyError || rolesError || linksError) throw new Error("Could not verify lobby access. Please try again.");
    if (!lobby) throw new Error("Lobby not found or access denied.");
    const admin = (roles ?? []).some(({ role }) => role === "admin" || role === "lfg_admin");
    const host = lobby.web_host_id === context.userId || (links ?? []).some((link) => !!link.discord_user_id && link.discord_user_id === lobby.host_id);
    if (!admin && !host) throw new Error("Only the host or an LFG admin can cancel this lobby.");
    if (lobby.status === "cancelled") return { ok: true };
    if (!["pending_creation", "posting", "searching"].includes(lobby.status)) throw new Error("This lobby is no longer open for cancellation.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: updated, error } = await supabaseAdmin.from("active_async_matches")
      .update({ status: "cancelled", auto_start_at: null })
      .eq("id", data.id).eq("status", lobby.status).eq("host_id", lobby.host_id)
      .select("id").maybeSingle();
    if (error) throw new Error("Could not cancel the lobby. Please try again.");
    if (!updated) throw new Error("The lobby changed. Refresh and try again.");
    return { ok: true };
  });