import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  message: z.string().trim().min(1).max(5000),
});

export const sendFeedback = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!LOVABLE_API_KEY || !RESEND_API_KEY) {
      throw new Error("Email service is not configured");
    }

    const fromEmail = data.email && data.email.length > 0 ? data.email : "anonymous";
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2 style="color:#111;">New Strategy Arena feedback</h2>
        <p><strong>From:</strong> ${escapeHtml(fromEmail)}</p>
        <p><strong>Message:</strong></p>
        <div style="white-space: pre-wrap; padding: 12px; background:#f6f6f6; border-radius:8px;">${escapeHtml(data.message)}</div>
      </div>
    `;

    const res = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": RESEND_API_KEY,
      },
      body: JSON.stringify({
        from: "Strategy Arena <onboarding@resend.dev>",
        to: ["strategyarena91@gmail.com"],
        subject: `New feedback from ${fromEmail}`,
        html,
        reply_to: data.email && data.email.length > 0 ? data.email : undefined,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Resend error ${res.status}: ${body}`);
    }
    return { ok: true };
  });

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}