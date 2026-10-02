export const DAILY_LIMIT = 80;
const FROM = "Strategy Arena <notifications@dunestats.cc>";

export type OutboxRow = {
  campaign: string;
  user_id: string | null;
  to_email: string;
  subject: string;
  html: string;
  text_body: string | null;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export async function enqueueEmails(rows: OutboxRow[]) {
  const db = await admin();
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("email_outbox").insert(rows.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }
  return rows.length;
}

async function sentLast24h(db: any): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await db
    .from("email_outbox")
    .select("id", { count: "exact", head: true })
    .eq("status", "sent")
    .gte("sent_at", since);
  return count ?? 0;
}

export async function outboxStatus() {
  const db = await admin();
  const [{ count: pending }, sent24] = await Promise.all([
    db.from("email_outbox").select("id", { count: "exact", head: true }).eq("status", "pending"),
    sentLast24h(db),
  ]);
  const { data: campaigns } = await db
    .from("email_outbox")
    .select("campaign, status")
    .eq("status", "pending")
    .limit(5000);
  const byCampaign: Record<string, number> = {};
  for (const r of campaigns ?? []) byCampaign[r.campaign] = (byCampaign[r.campaign] ?? 0) + 1;
  return { pending: pending ?? 0, sentLast24h: sent24, dailyLimit: DAILY_LIMIT, byCampaign };
}

/** Send the next batch of queued emails, never exceeding DAILY_LIMIT per rolling 24h. */
export async function dispatchOutbox() {
  const LOVABLE_API_KEY = process.env["LOVABLE_API_KEY"];
  const RESEND_API_KEY = process.env["RESEND_API_KEY"];
  if (!LOVABLE_API_KEY || !RESEND_API_KEY) throw new Error("Email service is not configured");
  const db = await admin();
  const budget = Math.max(0, DAILY_LIMIT - (await sentLast24h(db)));
  if (budget === 0) return { sent: 0, failed: 0, budget: 0 };

  const { data: rows, error } = await db
    .from("email_outbox")
    .select("id, to_email, subject, html, text_body")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(budget);
  if (error) throw new Error(error.message);

  let sent = 0;
  let failed = 0;
  const list = (rows ?? []) as any[];
  for (let i = 0; i < list.length; i += 50) {
    const chunk = list.slice(i, i + 50);
    const res = await fetch("https://connector-gateway.lovable.dev/resend/emails/batch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": RESEND_API_KEY,
      },
      body: JSON.stringify(
        chunk.map((r) => ({
          from: FROM,
          to: [r.to_email],
          subject: r.subject,
          html: r.html,
          ...(r.text_body ? { text: r.text_body } : {}),
        })),
      ),
    });
    const ids = chunk.map((r) => r.id);
    if (res.ok) {
      sent += chunk.length;
      await db.from("email_outbox").update({ status: "sent", sent_at: new Date().toISOString() }).in("id", ids);
    } else {
      const body = await res.text();
      console.error(`[email-outbox] batch failed ${res.status}: ${body}`);
      failed += chunk.length;
      // Leave rows pending on rate/quota errors so they retry next run.
      if (res.status !== 429) {
        await db.from("email_outbox").update({ status: "failed", error: `${res.status}: ${body}`.slice(0, 1000) }).in("id", ids);
      }
      break;
    }
    if (i + 50 < list.length) await new Promise((r) => setTimeout(r, 1000));
  }
  return { sent, failed, budget };
}
