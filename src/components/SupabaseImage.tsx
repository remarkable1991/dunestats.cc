import { useEffect, useState, type ImgHTMLAttributes, type SyntheticEvent } from "react";
import { r2FallbackUrl } from "@/lib/storage-r2";

export { r2FallbackUrl };

type SupabaseImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  src?: string;
  /** Bucket hint used when `src` is a bucket-relative path or a signed URL. */
  bucket?: string;
};

/**
 * <img> wrapper that transparently falls back to the matching Cloudflare R2
 * public domain when a Supabase Storage image fails to load.
 */
export function SupabaseImage({ src, bucket, onError, ...rest }: SupabaseImageProps) {
  const [current, setCurrent] = useState(src);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setCurrent(src);
    setFailed(false);
  }, [src]);

  const handleError = (e: SyntheticEvent<HTMLImageElement, Event>) => {
    if (!failed && src) {
      const fallback = r2FallbackUrl(src, bucket);
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
