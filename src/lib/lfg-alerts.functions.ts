import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { LfgDiscordPreference } from "@/lib/lfg-alerts";

export const lfgDiscordPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ enabled: z.boolean().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    // Only the verified middleware identity can be passed to the service-only helper.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: preference, error } = await supabaseAdmin.rpc("lfg_discord_alert_preference", {
      p_user: context.userId, p_enabled: data.enabled,
    });
    if (error) throw new Error("Could not update Discord alerts. Check that one verified Discord account is connected.");
    return preference as unknown as LfgDiscordPreference;
  });

export const lfgBrowserDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid(), action: z.enum(["claim", "received", "failed"]) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: ok, error } = await context.supabase.rpc("lfg_alert_browser_action", { p_id: data.id, p_action: data.action });
    if (error) throw new Error(error.message);
    return !!ok;
  });