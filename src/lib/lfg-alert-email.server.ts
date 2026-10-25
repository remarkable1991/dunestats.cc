import { mayEmailLfgAlert, type LfgAlert } from "./lfg-alerts";

/** Claimed events cannot be displayed by browsers; ambiguous browser delivery never falls back to email. */
export async function dispatchLfgAlertEmails() {
  const key = process.env["LOVABLE_API_KEY"];
  const resend = process.env["RESEND_API_KEY"];
  if (!key || !resend) throw new Error("Email service is not configured");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: alerts, error } = await supabaseAdmin.from("lfg_alert_deliveries")
    .select("id,lobby_id,title,body,kind,state,browser_received_at,email_due_at,expires_at")
    .eq("state", "pending").lte("email_due_at", new Date().toISOString())
    .gt("expires_at", new Date().toISOString()).order("created_at").limit(80);
  if (error) throw new Error(error.message);
  let sent = 0;
  for (const alert of (alerts ?? []) as LfgAlert[]) {
    if (!mayEmailLfgAlert(alert, Date.now())) continue;
    const { data: claimed, error: claimError } = await supabaseAdmin.rpc("lfg_claim_alert_email", { p_id: alert.id });
    if (claimError) throw new Error(claimError.message);
    if (!claimed) continue;
    const row = claimed as { outbox_id: string; email: string; title: string; body: string; lobby_id: number };
    const { signUnsubscribe } = await import("./unsubscribe.server");
    const { data: delivery } = await supabaseAdmin.from("lfg_alert_deliveries").select("user_id").eq("id", alert.id).single();
    if (!delivery) throw new Error("Alert recipient unavailable");
    const token = await signUnsubscribe(delivery.user_id);
    const text = `${row.body}\n\nOpen lobby: https://dunestats.cc/lfg/${row.lobby_id}\n\nStop LFG alerts: https://dunestats.cc/lfg\nUnsubscribe: https://dunestats.cc/unsubscribe?uid=${delivery.user_id}&token=${token}`;
    const response = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "X-Connection-Api-Key": resend, "Idempotency-Key": `lfg-alert-${alert.id}` },
      body: JSON.stringify({ from: "Strategy Arena <notifications@dunestats.cc>", to: [row.email], subject: row.title, text }),
    });
    const now = new Date().toISOString();
    if (!response.ok) {
      const body = await response.text();
      console.error(`[lfg-alert-email] ${response.status}: ${body}`);
      await supabaseAdmin.from("email_outbox").update({ status: "failed", error: `${response.status}: ${body}`.slice(0, 1000) }).eq("id", row.outbox_id);
      // Fail closed: do not retry an ambiguous provider response and risk duplicate emails.
      await supabaseAdmin.from("lfg_alert_deliveries").update({ state: "suppressed", updated_at: now }).eq("id", alert.id);
      throw new Error(`Email delivery failed (${response.status})`);
    }
    await supabaseAdmin.from("email_outbox").update({ status: "sent", sent_at: now, text_body: text }).eq("id", row.outbox_id);
    await supabaseAdmin.from("lfg_alert_deliveries").update({ state: "email_sent", email_sent_at: now, updated_at: now }).eq("id", alert.id);
    sent++;
  }
  return { sent };
}