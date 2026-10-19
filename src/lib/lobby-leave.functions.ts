import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const leaveLobby = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.number().int().positive() }))
  .handler(async ({ data, context }) => {
    // Respect the caller's lobby visibility before invoking the atomic self-only operation.
    const { data: row, error: accessError } = await context.supabase
      .from("active_async_matches").select("id").eq("id", data.id).maybeSingle();
    if (accessError || !row) throw new Error("Lobby not found or access denied.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("lfg_leave_seat", { p_id: data.id, p_actor: context.userId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });