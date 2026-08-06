import { createServerFn } from "@tanstack/react-start";

/**
 * Mirror an uploaded file into the matching Cloudflare R2 bucket so the
 * public R2 domain can serve it if Supabase Storage ever loses the object.
 *
 * Requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY.
 * Silently no-ops (returns { mirrored: false }) when they aren't configured,
 * so uploads never fail because of the backup path.
 */
export const mirrorToR2 = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { bucket: string; path: string; contentType: string; base64: string }) => data,
  )
  .handler(async ({ data }) => {
    const accountId = process.env["R2_ACCOUNT_ID"];
    const accessKeyId = process.env["R2_ACCESS_KEY_ID"];
    const secretAccessKey = process.env["R2_SECRET_ACCESS_KEY"];
    if (!accountId || !accessKeyId || !secretAccessKey) {
      return { mirrored: false, reason: "not-configured" as const };
    }

    const allowed = ["match-screenshots", "leader-portraits", "leader-cards"];
    if (!allowed.includes(data.bucket)) {
      return { mirrored: false, reason: "bad-bucket" as const };
    }
    const objectPath = data.path.replace(/^\/+/, "");
    if (!objectPath || objectPath.includes("..")) {
      return { mirrored: false, reason: "bad-path" as const };
    }

    const binary = atob(data.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const { AwsClient } = await import("aws4fetch");
    const client = new AwsClient({
      accessKeyId,
      secretAccessKey,
      service: "s3",
      region: "auto",
    });

    const url = `https://${accountId}.r2.cloudflarestorage.com/${data.bucket}/${objectPath}`;
    const res = await client.fetch(url, {
      method: "PUT",
      body: bytes,
      headers: { "Content-Type": data.contentType || "application/octet-stream" },
    });
    if (!res.ok) {
      console.error("[r2] mirror failed", res.status, await res.text().catch(() => ""));
      return { mirrored: false, reason: "upload-failed" as const };
    }
    return { mirrored: true as const };
  });
