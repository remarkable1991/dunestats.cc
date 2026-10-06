import { createServerFn } from "@tanstack/react-start";

/**
 * Endboard uploads go to a staging file first. After the telemetry Lambda
 * accepted it, `promoteEndboard` keeps the previous raw upload as
 * `<id>-endboard-raw-old1.png`, `-old2`, ... and moves staging to the default
 * `<id>-endboard-raw.png`. `discardEndboardStaging` removes a rejected upload.
 */
const BUCKET = "match-screenshots";

async function r2() {
  const accountId = process.env["R2_ACCOUNT_ID"];
  const accessKeyId = process.env["R2_ACCESS_KEY_ID"];
  const secretAccessKey = process.env["R2_SECRET_ACCESS_KEY"];
  if (!accountId || !accessKeyId || !secretAccessKey) return null;
  const { AwsClient } = await import("aws4fetch");
  const client = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
  const base = `https://${accountId}.r2.cloudflarestorage.com/${BUCKET}`;
  return { client, base };
}

function validId(id: string) {
  return /^[A-Za-z0-9_-]{3,80}$/.test(id);
}

export const promoteEndboard = createServerFn({ method: "POST" })
  .inputValidator((data: { matchId: string }) => data)
  .handler(async ({ data }) => {
    if (!validId(data.matchId)) return { ok: false as const, reason: "bad-id" };
    const conn = await r2();
    if (!conn) return { ok: false as const, reason: "not-configured" };
    const { client, base } = conn;
    const id = data.matchId;
    const dir = `matches/${id}/${id}`;
    const exists = async (key: string) => (await client.fetch(`${base}/${key}`, { method: "HEAD" })).ok;
    const copy = async (from: string, to: string) => {
      const res = await client.fetch(`${base}/${to}`, {
        method: "PUT",
        headers: { "x-amz-copy-source": `/${BUCKET}/${from}` },
      });
      if (!res.ok) throw new Error(`copy ${from} -> ${to} failed: ${res.status}`);
    };

    try {
      const staging = `${dir}-endboard-staging.png`;
      const raw = `${dir}-endboard-raw.png`;
      if (!(await exists(staging))) return { ok: false as const, reason: "no-staging" };

      let archived: string | null = null;
      if (await exists(raw)) {
        let n = 1;
        while (n < 100 && (await exists(`${dir}-endboard-raw-old${n}.png`))) n++;
        archived = `${dir}-endboard-raw-old${n}.png`;
        await copy(raw, archived);
      }
      await copy(staging, raw);
      await client.fetch(`${base}/${staging}`, { method: "DELETE" });
      return { ok: true as const, archived };
    } catch (e) {
      console.error("[endboard] promote failed", e);
      return { ok: false as const, reason: "copy-failed" };
    }
  });

export const discardEndboardStaging = createServerFn({ method: "POST" })
  .inputValidator((data: { matchId: string }) => data)
  .handler(async ({ data }) => {
    if (!validId(data.matchId)) return { ok: false };
    const conn = await r2();
    if (!conn) return { ok: false };
    const id = data.matchId;
    await conn.client
      .fetch(`${conn.base}/matches/${id}/${id}-endboard-staging.png`, { method: "DELETE" })
      .catch(() => null);
    return { ok: true };
  });
