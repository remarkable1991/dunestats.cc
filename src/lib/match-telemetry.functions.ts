import { createServerFn } from "@tanstack/react-start";

/**
 * Trigger the endboard telemetry Lambda after a raw endboard screenshot was
 * mirrored to R2. The Lambda reads the raw capture, extracts board telemetry
 * and writes the processed `<id>-content-area.png` next to it.
 *
 * Requires TELEMETRY_LAMBDA_URL (and optionally TELEMETRY_LAMBDA_SECRET, sent
 * as `x-api-key`). Silently no-ops when not configured so uploads never fail
 * because of the telemetry path.
 */
export const runMatchTelemetry = createServerFn({ method: "POST" })
  .inputValidator((data: { matchId: string; key: string }) => data)
  .handler(async ({ data }) => {
    const url = process.env["TELEMETRY_LAMBDA_URL"];
    if (!url) return { triggered: false, reason: "not-configured" as const };

    const secret = process.env["TELEMETRY_LAMBDA_SECRET"];
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(secret ? { "x-api-key": secret } : {}),
        },
        body: JSON.stringify({
          matchId: data.matchId,
          bucket: "match-screenshots",
          key: data.key,
        }),
      });
      if (!res.ok) {
        console.error("[telemetry] lambda rejected", res.status, await res.text().catch(() => ""));
        return { triggered: false, reason: "lambda-error" as const, status: res.status };
      }
      return { triggered: true as const };
    } catch (e) {
      console.error("[telemetry] lambda call failed", e);
      return { triggered: false, reason: "unreachable" as const };
    }
  });
