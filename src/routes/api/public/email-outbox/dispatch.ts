import { createFileRoute } from "@tanstack/react-router";

async function handle(request: Request) {
  const secret = process.env["EMAIL_CRON_SECRET"];
  const url = new URL(request.url);
  const given = request.headers.get("x-cron-secret") ?? url.searchParams.get("key");
  if (!secret || given !== secret) return new Response("Unauthorized", { status: 401 });
  try {
    const { dispatchOutbox } = await import("@/lib/email-outbox.server");
    return Response.json(await dispatchOutbox());
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/email-outbox/dispatch")({
  server: { handlers: { GET: ({ request }) => handle(request), POST: ({ request }) => handle(request) } },
});
