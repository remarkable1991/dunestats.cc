import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Public: turn off tournament emails using a signed link from an email footer. */
export const unsubscribeWithToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ uid: z.string().uuid(), token: z.string().min(8).max(128) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { verifyUnsubscribe } = await import("./unsubscribe.server");
    const ok = await verifyUnsubscribe(data.uid, data.token);
    if (!ok) return { ok: false as const, error: "This unsubscribe link is not valid." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .upsert({ id: data.uid, tournament_emails_opt_in: false }, { onConflict: "id" });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });
