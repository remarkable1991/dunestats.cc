import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertSender(context: any) {
  const { data, error } = await context.supabase.rpc("is_tournament_host", { _uid: context.userId });
  if (error || !data) throw new Error("Forbidden");
}

export const getOutboxStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSender(context);
    const { outboxStatus } = await import("./email-outbox.server");
    return outboxStatus();
  });

export const dispatchOutboxNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSender(context);
    const { dispatchOutbox } = await import("./email-outbox.server");
    return dispatchOutbox();
  });
