import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/lfg-alerts/dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["EMAIL_CRON_SECRET"];
        if (!secret || request.headers.get("x-cron-secret") !== secret) return new Response("Unauthorized", { status: 401 });
        try {
          const { dispatchLfgAlertEmails } = await import("@/lib/lfg-alert-email.server");
          return Response.json(await dispatchLfgAlertEmails());
        } catch (error) {
          console.error("[lfg-alert-dispatch]", error);
          return Response.json({ error: "LFG email dispatch failed" }, { status: 500 });
        }
      },
    },
  },
});