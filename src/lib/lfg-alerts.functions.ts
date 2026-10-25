import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const lfgBrowserDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid(), action: z.enum(["claim", "received", "failed"]) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: ok, error } = await context.supabase.rpc("lfg_alert_browser_action", { p_id: data.id, p_action: data.action });
    if (error) throw new Error(error.message);
    return !!ok;
  });