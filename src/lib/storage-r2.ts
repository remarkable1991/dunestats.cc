import { supabase } from "@/integrations/supabase/client";

const SUPABASE_HOST = "hyyrftnqalzarclbhedx.supabase.co";

/** Public Cloudflare R2 domain per Supabase Storage bucket. */
export const R2_DOMAINS: Record<string, string> = {
  "match-screenshots": "https://pub-6fb62f34a2e3491fa0c7c71cc9a969fd.r2.dev",
  "leader-portraits": "https://pub-5ba61a8dddbc4336a6bacebf469db456.r2.dev",
  "leader-cards": "https://pub-3924274d769c4e4ca932d9c537bb5834.r2.dev",
};

export type R2Bucket = keyof typeof R2_DOMAINS;

/** Build the R2 backup URL for a bucket-relative object path. */
export function r2UrlFor(bucket: string, filePath: string): string | null {
  const base = R2_DOMAINS[bucket];
  if (!base) return null;
  const path = filePath.replace(/^\/+/, "");
  if (!path) return null;
  return `${base}/${path}`;
}

/**
 * Derive the R2 backup URL from any Supabase Storage URL or a
 * `<bucket>/<path>` style relative path. Returns null when the source
 * doesn't belong to one of the mapped buckets.
 */
export function r2FallbackUrl(src: string, bucketHint?: string): string | null {
  if (!src) return null;
  let path = src;

  if (/^https?:\/\//i.test(src)) {
    // Already an R2 URL — nothing to fall back to.
    if (Object.values(R2_DOMAINS).some((d) => src.startsWith(d))) return null;
    let u: URL;
    try {
      u = new URL(src);
    } catch {
      return null;
    }
    if (u.hostname !== SUPABASE_HOST) return null;
    path = u.pathname;
  }

  path = path.replace(/^\/+/, "");
  // Strip any Supabase storage API prefix, leaving `<bucket>/<objectPath>`.
  path = path.replace(/^storage\/v1\/object\/(public\/|sign\/|authenticated\/)?/, "");

  for (const bucket of Object.keys(R2_DOMAINS)) {
    if (path.startsWith(`${bucket}/`)) {
      return r2UrlFor(bucket, path.slice(bucket.length + 1));
    }
  }

  // No bucket segment present: use the caller-provided bucket.
  if (bucketHint) return r2UrlFor(bucketHint, path);
  return null;
}

/**
 * Ask Supabase for a signed URL, never throwing. Falls back to the
 * bucket's public R2 domain when Supabase errors or returns nothing
 * (deleted object, 400, network failure, ...).
 */
export async function signedUrlOrR2(
  bucket: string,
  filePath: string,
  expiresIn = 3600,
): Promise<string | null> {
  if (!filePath) return null;
  if (/^https?:\/\//i.test(filePath)) return filePath;
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(filePath, expiresIn);
    if (error || !data?.signedUrl) return r2UrlFor(bucket, filePath);
    return data.signedUrl;
  } catch (e) {
    console.warn(`[storage] signed URL failed for ${bucket}/${filePath}`, e);
    return r2UrlFor(bucket, filePath);
  }
}

/**
 * Unsigned Supabase Storage "sign" URL. Used as a fallback when a tokened
 * signed URL fails to load (expired/rejected token) — harmless if the object
 * requires a token, the <img> simply errors again.
 */
export function unsignedSignUrl(bucket: string, filePath: string): string {
  const path = filePath.replace(/^\/+/, "");
  return `https://${SUPABASE_HOST}/storage/v1/object/sign/${bucket}/${path}`;
}

/**
 * Fire-and-forget backup of an uploaded file into the matching R2 bucket.
 * Never throws — the Supabase upload is the source of truth.
 */
export async function mirrorFileToR2(
  bucket: string,
  path: string,
  contentType: string,
  file: Blob,
): Promise<void> {
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
      binary += String.fromCharCode(...buf.subarray(i, i + chunk));
    }
    const { mirrorToR2 } = await import("@/lib/r2-mirror.functions");
    await mirrorToR2({ data: { bucket, path, contentType, base64: btoa(binary) } });
  } catch (e) {
    console.warn("[storage] R2 mirror failed", e);
  }
}

/**
 * Upload a file straight to Cloudflare R2, bypassing Supabase Storage.
 * Unlike {@link mirrorFileToR2} this THROWS when the R2 write fails.
 */
export async function uploadToR2(
  bucket: string,
  path: string,
  contentType: string,
  file: Blob,
): Promise<void> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  const { mirrorToR2 } = await import("@/lib/r2-mirror.functions");
  const res = await mirrorToR2({ data: { bucket, path, contentType, base64: btoa(binary) } });
  if (!res?.mirrored) {
    throw new Error(`R2 upload failed${res?.reason ? `: ${res.reason}` : ""}`);
  }
}
