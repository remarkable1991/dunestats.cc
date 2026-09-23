import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SITE_URL = "https://dunestats.cc";
const FROM = "Strategy Arena <notifications@dunestats.cc>";
const LOGO_URL = `${SITE_URL}/__l5e/assets-v1/86019993-985b-40c6-9313-a7f6caafee03/logo.png`;

export const NOTIFICATION_KINDS = ["lfg_live", "lfg_async", "game_result", "general_news"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const KIND_META: Record<
  NotificationKind,
  { label: string; optInColumn: string; placeholders: string[] }
> = {
  lfg_live: {
    label: "New LFG — Live games",
    optInColumn: "lfg_live_emails_opt_in",
    placeholders: ["host_name", "match_id", "board", "expansions", "notes", "seats_open", "lobby_url"],
  },
  lfg_async: {
    label: "New LFG — Async games",
    optInColumn: "lfg_async_emails_opt_in",
    placeholders: ["host_name", "match_id", "board", "expansions", "notes", "seats_open", "lobby_url"],
  },
  game_result: {
    label: "Game results",
    optInColumn: "game_result_emails_opt_in",
    placeholders: ["player_name", "match_id", "placement", "points", "leader_name", "elo_delta", "match_url"],
  },
  general_news: {
    label: "General news",
    optInColumn: "news_emails_opt_in",
    placeholders: ["headline", "body", "cta_label", "cta_url"],
  },
};

export const COMMON_PLACEHOLDERS = ["logo_url", "site_url", "profile_url", "unsubscribe_url", "year"];

/** Sample values used for previews and test emails. */
const SAMPLE: Record<NotificationKind, Record<string, string>> = {
  lfg_live: {
    host_name: "ReMarkable",
    match_id: "1234",
    board: "Uprising",
    expansions: "Rise of Ix, Immortality",
    notes: "Friendly game, voice optional",
    seats_open: "2",
    lobby_url: `${SITE_URL}/lfg`,
  },
  lfg_async: {
    host_name: "ReMarkable",
    match_id: "5678",
    board: "Uprising",
    expansions: "Rise of Ix",
    notes: "One turn per day",
    seats_open: "3",
    lobby_url: `${SITE_URL}/lfg`,
  },
  game_result: {
    player_name: "ReMarkable",
    match_id: "CALADAN-ATREIDES-1065",
    placement: "1st",
    points: "11",
    leader_name: "Paul Atreides",
    elo_delta: "+14.2",
    match_url: `${SITE_URL}/matches`,
  },
  general_news: {
    headline: "New season starts next week",
    body: "Seasonal SP resets on Monday. Check the rewards page for this season's prizes.",
    cta_label: "View rewards",
    cta_url: `${SITE_URL}/rewards`,
  },
};

const wrap = (title: string, inner: string, cta: string, ctaUrl: string) => `<div style="margin:0;padding:24px 0;background:#121214;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#1a1a1d;border:1px solid #2c2c31;border-radius:12px;overflow:hidden;">
    <tr><td style="padding:24px;text-align:center;background:#131316;border-bottom:2px solid #d9943b;">
      <img src="{{logo_url}}" width="48" height="48" alt="Strategy Arena" style="display:block;margin:0 auto 10px;" />
      <div style="font-size:20px;letter-spacing:3px;color:#d9943b;font-weight:bold;">STRATEGY ARENA</div>
    </td></tr>
    <tr><td style="padding:28px 24px;color:#e7e7ea;">
      <h1 style="margin:0 0 12px;font-size:22px;color:#ffffff;">${title}</h1>
      ${inner}
      <p style="text-align:center;margin:28px 0 8px;"><a href="${ctaUrl}" style="display:inline-block;background:#d9943b;color:#121214;text-decoration:none;font-weight:bold;padding:12px 26px;border-radius:8px;">${cta}</a></p>
    </td></tr>
    <tr><td style="padding:18px 24px;background:#131316;border-top:1px solid #2c2c31;color:#77777f;font-size:11px;text-align:center;">
      <a href="{{profile_url}}" style="color:#d9943b;">Manage email preferences</a> · <a href="{{unsubscribe_url}}" style="color:#d9943b;">Unsubscribe</a> · <a href="{{site_url}}" style="color:#d9943b;">dunestats.cc</a>
    </td></tr>
  </table>
</div>`;

const lfgInner = `<p style="margin:0 0 8px;color:#d6d6db;">{{board}} · {{expansions}}</p>
      <p style="margin:0 0 8px;color:#d6d6db;">{{seats_open}} seat(s) open</p>
      <p style="margin:0;color:#9c9ca5;white-space:pre-line;">{{notes}}</p>`;

export const DEFAULTS: Record<NotificationKind, { subject: string; previewText: string; text: string; html: string }> = {
  lfg_live: {
    subject: "🟢 {{host_name}} is looking for players (Live)",
    previewText: "A live game is starting — {{seats_open}} seat(s) open.",
    text: `{{host_name}}'s Game [ID: {{match_id}}] — Live\n{{board}} · {{expansions}}\n{{seats_open}} seat(s) open\n{{notes}}\n\nJoin: {{lobby_url}}\n\nUnsubscribe: {{unsubscribe_url}}`,
    html: wrap("{{host_name}}'s Game — Live", lfgInner, "Join the lobby", "{{lobby_url}}"),
  },
  lfg_async: {
    subject: "⏳ {{host_name}} is looking for players (Async)",
    previewText: "A new async game — {{seats_open}} seat(s) open.",
    text: `{{host_name}}'s Game [ID: {{match_id}}] — Async\n{{board}} · {{expansions}}\n{{seats_open}} seat(s) open\n{{notes}}\n\nJoin: {{lobby_url}}\n\nUnsubscribe: {{unsubscribe_url}}`,
    html: wrap("{{host_name}}'s Game — Async", lfgInner, "Join the lobby", "{{lobby_url}}"),
  },
  game_result: {
    subject: "🏆 Your result: {{placement}} in #{{match_id}}",
    previewText: "{{points}} VP with {{leader_name}} ({{elo_delta}} Elo).",
    text: `Hi {{player_name}},\n\nYou finished {{placement}} with {{leader_name}} ({{points}} VP, {{elo_delta}} Elo).\n\nView match: {{match_url}}\n\nUnsubscribe: {{unsubscribe_url}}`,
    html: wrap(
      "You finished {{placement}}",
      `<p style="margin:0 0 8px;color:#d6d6db;">Match #{{match_id}} · {{leader_name}}</p><p style="margin:0;color:#d6d6db;">{{points}} VP · {{elo_delta}} Elo</p>`,
      "View match",
      "{{match_url}}",
    ),
  },
  general_news: {
    subject: "📣 {{headline}}",
    previewText: "News from Strategy Arena.",
    text: `{{headline}}\n\n{{body}}\n\n{{cta_label}}: {{cta_url}}\n\nUnsubscribe: {{unsubscribe_url}}`,
    html: wrap(
      "{{headline}}",
      `<div style="white-space:pre-line;font-size:15px;line-height:1.6;color:#d6d6db;">{{body}}</div>`,
      "{{cta_label}}",
      "{{cta_url}}",
    ),
  },
};

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function values(kind: NotificationKind, unsub: string, extra?: Record<string, string>) {
  return {
    ...SAMPLE[kind],
    ...(extra ?? {}),
    logo_url: LOGO_URL,
    site_url: SITE_URL,
    profile_url: `${SITE_URL}/profile`,
    unsubscribe_url: unsub,
    year: String(new Date().getFullYear()),
  } as Record<string, string>;
}

function fill(tpl: string, v: Record<string, string>, html: boolean) {
  return tpl.replace(/\{\{\s*([a-z_0-9]+)\s*\}\}/gi, (m, k: string) => {
    const val = v[k.toLowerCase()];
    if (val === undefined) return m;
    return html && !k.toLowerCase().endsWith("_url") ? escapeHtml(val) : val;
  });
}

function withPreheader(html: string, preview: string) {
  if (!preview.trim()) return html;
  return `<div style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(preview)}</div>${html}`;
}

async function assertMainAdmin(context: any) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error || !data) throw new Error("Forbidden: main admin only");
}

const tplSchema = z.object({
  kind: z.enum(NOTIFICATION_KINDS),
  subject: z.string().min(1).max(300),
  previewText: z.string().max(500),
  text: z.string().max(100000),
  html: z.string().min(1).max(200000),
});

export const getNotificationTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertMainAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("email_templates")
      .select("id, subject_template, html_template, preview_text_template, text_template")
      .in("id", NOTIFICATION_KINDS as unknown as string[]);
    const out = {} as Record<NotificationKind, { subject: string; previewText: string; text: string; html: string }>;
    for (const k of NOTIFICATION_KINDS) {
      const row = (data ?? []).find((r: any) => r.id === k) as any;
      out[k] = {
        subject: row?.subject_template || DEFAULTS[k].subject,
        previewText: row?.preview_text_template || DEFAULTS[k].previewText,
        text: row?.text_template || DEFAULTS[k].text,
        html: row?.html_template || DEFAULTS[k].html,
      };
    }
    return { templates: out, adminEmail: ((context as any).claims?.email as string | undefined) ?? null };
  });

export const saveNotificationTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => tplSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertMainAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("email_templates").upsert({
      id: data.kind,
      subject_template: data.subject,
      preview_text_template: data.previewText,
      text_template: data.text,
      html_template: data.html,
      updated_by: (context as any).userId,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const previewNotificationTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => tplSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertMainAdmin(context);
    const v = values(data.kind, `${SITE_URL}/profile`);
    return {
      subject: fill(data.subject, v, false),
      previewText: fill(data.previewText, v, false),
      text: fill(data.text, v, false),
      html: fill(data.html, v, true),
    };
  });

export const sendNotificationTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => tplSchema.extend({ test_email: z.string().trim().email().max(255) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMainAdmin(context);
    const LOVABLE_API_KEY = process.env["LOVABLE_API_KEY"];
    const RESEND_API_KEY = process.env["RESEND_API_KEY"];
    if (!LOVABLE_API_KEY || !RESEND_API_KEY) throw new Error("Email service is not configured");
    const { signUnsubscribe } = await import("./unsubscribe.server");
    const uid = (context as any).userId as string;
    const token = await signUnsubscribe(uid);
    const v = values(data.kind, `${SITE_URL}/unsubscribe?uid=${uid}&token=${token}`);
    const res = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": RESEND_API_KEY,
      },
      body: JSON.stringify({
        from: FROM,
        to: [data.test_email],
        subject: fill(data.subject, v, false),
        text: fill(data.text, v, false),
        html: withPreheader(fill(data.html, v, true), fill(data.previewText, v, false)),
      }),
    });
    if (!res.ok) throw new Error(`Send failed (${res.status})`);
    return { ok: true };
  });
