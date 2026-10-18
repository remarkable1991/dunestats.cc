import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listConsolidationAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ search: z.string().trim().min(2).max(64) }))
  .handler(async ({ data, context }) => {
    const { data: admin, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (error || !admin) throw new Error("Main admins only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const term = data.search.replace(/[%_]/g, "");
    if (term.length < 2) throw new Error("Enter at least two letters");
    const { data: profiles, error: profileError } = await supabaseAdmin.from("profiles")
      .select("id,username,discord_username").or(`username.ilike.%${term.replace(/[^a-zA-Z0-9 '’-]/g, "") }%,discord_username.ilike.%${term.replace(/[^a-zA-Z0-9 '’-]/g, "") }%`).limit(20);
    if (profileError) throw new Error("Could not look up accounts");
    return profiles ?? [];
  });

export const consolidatePlayerRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ source: z.uuid(), target: z.uuid(), confirmed: z.literal(true) }))
  .handler(async ({ data, context }) => {
    const { data: admin, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (error || !admin) throw new Error("Main admins only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error: mergeError } = await supabaseAdmin.rpc("admin_consolidate_player_records", {
      p_source: data.source, p_target: data.target, p_confirm_same_person: data.confirmed, p_actor: context.userId,
    });
    if (mergeError) throw new Error(mergeError.message);
    return result;
  });