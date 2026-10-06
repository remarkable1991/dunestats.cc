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

async function helpers() {
  const conn = await r2();
  if (!conn) return null;
  const { client, base } = conn;
  const exists = async (key: string) => (await client.fetch(`${base}/${key}`, { method: "HEAD" })).ok;
  const copy = async (from: string, to: string) => {
    const res = await client.fetch(`${base}/${to}`, {
      method: "PUT",
      headers: { "x-amz-copy-source": `/${BUCKET}/${from}` },
    });
    if (!res.ok) throw new Error(`copy ${from} -> ${to} failed: ${res.status}`);
  };
  const del = (key: string) => client.fetch(`${base}/${key}`, { method: "DELETE" }).catch(() => null);
  return { exists, copy, del };
}

/** Before uploading: if a raw endboard exists, copy it to the next free -raw-oldN. */
export const backupEndboard = createServerFn({ method: "POST" })
  .inputValidator((data: { matchId: string }) => data)
  .handler(async ({ data }) => {
    if (!validId(data.matchId)) return { ok: false as const, backup: null };
    const h = await helpers();
    if (!h) return { ok: false as const, backup: null };
    const dir = `matches/${data.matchId}/${data.matchId}`;
    const raw = `${dir}-endboard-raw.png`;
    try {
      if (!(await h.exists(raw))) return { ok: true as const, backup: null };
      let n = 1;
      while (n < 100 && (await h.exists(`${dir}-endboard-raw-old${n}.png`))) n++;
      const backup = `${dir}-endboard-raw-old${n}.png`;
      await h.copy(raw, backup);
      return { ok: true as const, backup };
    } catch (e) {
      console.error("[endboard] backup failed", e);
      return { ok: false as const, backup: null };
    }
  });

/** Scan rejected: delete the new raw and move the backup back to raw. */
export const restoreEndboard = createServerFn({ method: "POST" })
  .inputValidator((data: { matchId: string; backup: string | null }) => data)
  .handler(async ({ data }) => {
    if (!validId(data.matchId)) return { ok: false };
    const h = await helpers();
    if (!h) return { ok: false };
    const dir = `matches/${data.matchId}/${data.matchId}`;
    const raw = `${dir}-endboard-raw.png`;
    try {
      if (data.backup && data.backup.startsWith(`${dir}-endboard-raw-old`)) {
        await h.copy(data.backup, raw);
        await h.del(data.backup);
      } else {
        await h.del(raw);
      }
      return { ok: true };
    } catch (e) {
      console.error("[endboard] restore failed", e);
      return { ok: false };
    }
  });
