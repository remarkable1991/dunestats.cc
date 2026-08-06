import { useEffect, useState, type ImgHTMLAttributes, type SyntheticEvent } from "react";

const SUPABASE_HOST = "hyyrftnqalzarclbhedx.supabase.co";
const R2_BASE = "https://pub-f1cf1291e80f47448517d28bc5cb51b3.r2.dev";
const BUCKET_PREFIXES = [
  "/storage/v1/object/public/match-screenshots/",
  "/storage/v1/object/sign/match-screenshots/",
  "/storage/v1/object/match-screenshots/",
  "match-screenshots/",
];

/** Strip the Supabase host + bucket prefix, returning the relative object path. */
export function r2FallbackUrl(src: string): string | null {
  if (!src) return null;
  let path = src;
  if (/^https?:\/\//i.test(src)) {
    let u: URL;
    try {
      u = new URL(src);
    } catch {
      return null;
    }
    if (u.hostname !== SUPABASE_HOST) return null;
    path = u.pathname;
  }
  for (const prefix of BUCKET_PREFIXES) {
    if (path.startsWith(prefix)) {
      path = path.slice(prefix.length);
      break;
    }
  }
  path = path.replace(/^\/+/, "");
  if (!path) return null;
  return `${R2_BASE}/${path}`;
}

type SupabaseImageProps = ImgHTMLAttributes<HTMLImageElement> & { src?: string };

/**
 * <img> wrapper that transparently falls back to Cloudflare R2 when a
 * Supabase Storage image fails to load.
 */
export function SupabaseImage({ src, onError, ...rest }: SupabaseImageProps) {
  const [current, setCurrent] = useState(src);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setCurrent(src);
    setFailed(false);
  }, [src]);

  const handleError = (e: SyntheticEvent<HTMLImageElement, Event>) => {
    if (!failed && src) {
      const fallback = r2FallbackUrl(src);
      if (fallback && fallback !== current) {
        setFailed(true);
        setCurrent(fallback);
        return;
      }
    }
    onError?.(e);
  };

  return <img {...rest} src={current} onError={handleError} />;
}
