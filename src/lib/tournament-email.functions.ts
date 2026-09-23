import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const TEMPLATE_ID = "tournament_announcement";
const SITE_URL = "https://dunestats.cc";
const FROM = "Dune Stats <notifications@dunestats.cc>";
const LOGO_URL = `${SITE_URL}/favicon.ico`;

export const DEFAULT_SUBJECT = "⚔️ Tournament {{tournament_num}}: {{tournament_name}}";

export const DEFAULT_HTML = `<div style="margin:0;padding:24px 0;background:#121214;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#1a1a1d;border:1px solid #2c2c31;border-radius:12px;overflow:hidden;">
    <tr>
      <td style="padding:24px;text-align:center;background:#131316;border-bottom:2px solid #d9943b;">
        <img src="{{logo_url}}" width="48" height="48" alt="Strategy Arena" style="display:block;margin:0 auto 10px;" />
        <div style="font-size:20px;letter-spacing:3px;color:#d9943b;font-weight:bold;">STRATEGY ARENA</div>
        <div style="font-size:11px;letter-spacing:2px;color:#8b8b93;text-transform:uppercase;">Where great minds compete</div>
      </td>
    </tr>
    <tr>
      <td style="padding:28px 24px;color:#e7e7ea;">
        <h1 style="margin:0 0 6px;font-size:22px;color:#ffffff;">{{info_title}}</h1>
        <p style="margin:0 0 18px;color:#9c9ca5;font-size:13px;">Tournament {{tournament_num}} · {{format}} · {{start_date}} → {{end_date}}</p>
        <div style="white-space:pre-line;font-size:15px;line-height:1.6;color:#d6d6db;">{{info_text}}</div>
        {{prizes_block}}
        <p style="text-align:center;margin:28px 0 8px;">
          <a href="{{register_url}}" style="display:inline-block;background:#d9943b;color:#121214;text-decoration:none;font-weight:bold;padding:12px 26px;border-radius:8px;">View tournament</a>
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:18px 24px;background:#131316;border-top:1px solid #2c2c31;color:#77777f;font-size:11px;text-align:center;">
        You receive this because you are registered on Strategy Arena.<br />
        <a href="{{profile_url}}" style="color:#d9943b;">Manage email preferences</a> · <a href="{{site_url}}" style="color:#d9943b;">dunestats.cc</a>
      </td>
    </tr>
  </table>
</div>`;

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type TournamentRow = {
  tournament_num: number;
  name: string;
  start_date: string;
  end_date: string;
  info_title: string | null;
  info_text: string | null;
  prizes_summary: string | null;
  prizes_text: string | null;
  board_version: string;
  play_mode: string;
  has_rise_of_ix: boolean;
  has_epic_mode: boolean;
  has_immortality: boolean;
  has_base_leaders: boolean;
};

function formatMode(t: TournamentRow): string {
  const parts = [t.board_version === "base" ? "Base" : "Uprising"];
  if (t.has_rise_of_ix) parts.push("Rise of Ix");
  if (t.has_immortality) parts.push("Immortality");
  if (t.has_epic_mode) parts.push("Epic");
  if (t.has_base_leaders) parts.push("Base leaders");
  return `${parts.join(" + ")} · ${t.play_mode === "async" ? "Async" : "Live"}`;
}

/** Absolute, email-safe image URLs (hosted assets). */
const IMG = {
  uprising: `${SITE_URL}/__l5e/assets-v1/cae6ede9-1764-4273-b2cf-8ee91ce0a0bd/uprising.png`,
  ix: `${SITE_URL}/__l5e/assets-v1/14fa7f9d-31bd-48ec-9147-311555a463be/ix.png`,
  immortality: `${SITE_URL}/__l5e/assets-v1/8a039ec3-2b22-4829-a5be-0cf046fe7ccf/immo.png`,
  epic: `${SITE_URL}/__l5e/assets-v1/ccaab891-c7f4-4b96-a3af-aaf36740877c/epic.png`,
  live: `${SITE_URL}/__l5e/assets-v1/80d86a9e-99ce-453c-b491-5956cae54f42/live-mode.png`,
  async: `${SITE_URL}/__l5e/assets-v1/366751c5-5c04-41b2-8b5a-b577ddf214aa/async-mode.png`,
  logo: `${SITE_URL}/__l5e/assets-v1/86019993-985b-40c6-9313-a7f6caafee03/logo.png`,
};

function iconChip(src: string | null, label: string): string {
  const img = src
    ? `<img src="${src}" height="18" alt="${escapeHtml(label)}" style="vertical-align:middle;margin-right:4px;">`
    : "";
  return `${img}${escapeHtml(label)}`;
}

function formatModeHtml(t: TournamentRow): string {
  const chips: string[] = [];
  if (t.board_version === "base") chips.push(iconChip(null, "Base Game"));
  else chips.push(iconChip(IMG.uprising, "Uprising"));
  if (t.has_rise_of_ix) chips.push(iconChip(IMG.ix, "Rise of Ix"));
  if (t.has_immortality) chips.push(iconChip(IMG.immortality, "Immortality"));
  if (t.has_epic_mode) chips.push(iconChip(IMG.epic, "Epic"));
  if (t.has_base_leaders) chips.push(iconChip(null, "Base leaders"));
  chips.push(
    t.play_mode === "async" ? iconChip(IMG.async, "Async") : iconChip(IMG.live, "Live"),
  );
  return chips.join(" &nbsp;&middot;&nbsp; ");
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** "2026-09-25" -> "Friday 25th of September 2026" */
function longDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${WEEKDAYS[d.getUTCDay()]} ${ordinal(d.getUTCDate())} of ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function fillTemplate(tpl: string, t: TournamentRow, unsubscribeUrl = `${SITE_URL}/profile`): string {
  const prizes = [t.prizes_summary, t.prizes_text]
    .filter((v) => v && v.trim())
    .map((v) => (v as string).trim())
    .join("\n\n")
    .trim();
  const prizesBlock = prizes
    ? `<div style="margin-top:22px;padding:14px 16px;background:#202024;border-left:3px solid #d9943b;border-radius:6px;"><div style="color:#d9943b;font-weight:bold;font-size:13px;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;">Prizes</div><div style="white-space:pre-line;font-size:14px;line-height:1.6;color:#d6d6db;">${escapeHtml(prizes)}</div></div>`
    : "";

  const bool = (v: boolean) => (v ? "true" : "");

  const values: Record<string, string> = {
    tournament_num: String(t.tournament_num),
    tournament_name: escapeHtml(t.name),
    info_title: escapeHtml(t.info_title?.trim() || t.name),
    info_text: escapeHtml(t.info_text ?? ""),
    prizes_summary: escapeHtml(t.prizes_summary ?? ""),
    prizes_text: escapeHtml(t.prizes_text ?? ""),
    prizes_block: prizesBlock,
    format: formatModeHtml(t),
    format_html: formatModeHtml(t),
    format_text: escapeHtml(formatMode(t)),
    is_live: bool(t.play_mode !== "async"),
    is_async: bool(t.play_mode === "async"),
    has_uprising: bool(t.board_version !== "base"),
    has_base: bool(t.board_version === "base"),
    has_rise_of_ix: bool(t.has_rise_of_ix),
    has_immortality: bool(t.has_immortality),
    has_epic_mode: bool(t.has_epic_mode),
    has_base_leaders: bool(t.has_base_leaders),
    start_date: longDate(t.start_date),
    end_date: longDate(t.end_date),
    start_date_raw: t.start_date,
    end_date_raw: t.end_date,
    logo_url: LOGO_URL,
    site_url: SITE_URL,
    register_url: `${SITE_URL}/tournament`,
    profile_url: `${SITE_URL}/profile`,
    unsubscribe_url: unsubscribeUrl,
    year: String(new Date().getFullYear()),
  };

  return tpl.replace(/\{\{\s*([a-z_0-9]+)\s*\}\}/gi, (m, key: string) => values[key.toLowerCase()] ?? m);
}

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden: admin only");
}

async function loadTournament(num: number): Promise<TournamentRow> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("tournaments")
    .select(
      "tournament_num, name, start_date, end_date, info_title, info_text, prizes_summary, prizes_text, board_version, play_mode, has_rise_of_ix, has_epic_mode, has_immortality, has_base_leaders",
    )
    .eq("tournament_num", num)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Tournament ${num} not found`);
  return data as unknown as TournamentRow;
}

type Recipient = { id: string; email: string };

async function listUsers(): Promise<Recipient[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const out: Recipient[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    for (const u of data.users) if (u.email) out.push({ id: u.id, email: u.email });
    if (data.users.length < 1000) break;
  }
  return out;
}

async function audienceRecipients(audience: "subscribed" | "all"): Promise<Recipient[]> {
  const users = await listUsers();
  if (audience === "all") return users;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("profiles").select("id, tournament_emails_opt_in");
  if (error) throw new Error(error.message);
  const optedOut = new Set(
    (data ?? []).filter((p: any) => p.tournament_emails_opt_in === false).map((p: any) => p.id as string),
  );
  return users.filter((u) => !optedOut.has(u.id));
}

/** Template + recipient counts for the admin email page. */
export const getTournamentEmailSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("email_templates")
      .select("subject_template, html_template")
      .eq("id", TEMPLATE_ID)
      .maybeSingle();

    const [all, subscribed] = await Promise.all([
      audienceRecipients("all"),
      audienceRecipients("subscribed"),
    ]);

    const row = data as { subject_template?: string; html_template?: string } | null;
    return {
      subject: row?.subject_template?.trim() ? row.subject_template : DEFAULT_SUBJECT,
      html: row?.html_template?.trim() ? row.html_template : DEFAULT_HTML,
      counts: { all: all.length, subscribed: subscribed.length },
      adminEmail: (context as any).claims?.email ?? "",
    };
  });

/** Save the default tournament email template. */
export const saveTournamentTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ subject: z.string().trim().min(1).max(300), html: z.string().min(1).max(200000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("email_templates").upsert({
      id: TEMPLATE_ID,
      subject_template: data.subject,
      html_template: data.html,
      updated_by: (context as any).userId,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Render the template with a tournament's live content. */
export const previewTournamentEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        tournament_num: z.number().int(),
        subject: z.string().max(300),
        html: z.string().max(200000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const t = await loadTournament(data.tournament_num);
    const url = await unsubscribeUrlFor((context as any).userId as string);
    return {
      subject: fillTemplate(data.subject || DEFAULT_SUBJECT, t, url),
      html: fillTemplate(data.html || DEFAULT_HTML, t, url),
    };
  });

async function unsubscribeUrlFor(userId: string | null | undefined): Promise<string> {
  if (!userId) return `${SITE_URL}/profile`;
  try {
    const { signUnsubscribe } = await import("./unsubscribe.server");
    const token = await signUnsubscribe(userId);
    return `${SITE_URL}/unsubscribe?uid=${encodeURIComponent(userId)}&token=${token}`;
  } catch {
    return `${SITE_URL}/profile`;
  }
}

/** Send the tournament email to a test address, subscribers, or everyone. */
export const sendTournamentEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        tournament_num: z.number().int(),
        subject: z.string().max(300),
        html: z.string().max(200000),
        audience: z.enum(["test", "subscribed", "all"]),
        test_email: z.string().trim().email().max(255).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);

    const LOVABLE_API_KEY = process.env["LOVABLE_API_KEY"];
    const RESEND_API_KEY = process.env["RESEND_API_KEY"];
    if (!LOVABLE_API_KEY || !RESEND_API_KEY) throw new Error("Email service is not configured");

    const t = await loadTournament(data.tournament_num);
    const subject = fillTemplate(data.subject || DEFAULT_SUBJECT, t);

    let recipients: Recipient[];
    if (data.audience === "test") {
      const to = data.test_email ?? (context as any).claims?.email;
      if (!to) throw new Error("No test email address available");
      recipients = [{ id: (context as any).userId as string, email: to }];
    } else {
      recipients = await audienceRecipients(data.audience);
    }
    if (recipients.length === 0) return { ok: true, sent: 0, failed: 0 };

    let sent = 0;
    let failed = 0;
    let lastError = "";
    const chunkSize = 50;
    for (let i = 0; i < recipients.length; i += chunkSize) {
      const chunk = recipients.slice(i, i + chunkSize);
      const payload = await Promise.all(
        chunk.map(async (r) => ({
          from: FROM,
          to: [r.email],
          subject,
          html: fillTemplate(data.html || DEFAULT_HTML, t, await unsubscribeUrlFor(r.id)),
        })),
      );
      const res = await fetch("https://connector-gateway.lovable.dev/resend/emails/batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": RESEND_API_KEY,
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        sent += chunk.length;
      } else {
        failed += chunk.length;
        lastError = `${res.status}: ${await res.text()}`;
        console.error(`[tournament-email] batch failed ${lastError}`);
      }
    }
    return { ok: failed === 0, sent, failed, error: lastError || undefined };
  });
