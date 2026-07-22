import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// In-memory cache of slug -> signed URL (or null when missing).
const cache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

function fetchPortrait(slug: string): Promise<string | null> {
  if (cache.has(slug)) return Promise.resolve(cache.get(slug) ?? null);
  const existing = inflight.get(slug);
  if (existing) return existing;
  const p = (async () => {
    const { data } = await supabase.storage
      .from("leader-portraits")
      .createSignedUrl(`${slug}.jpg`, 3600);
    const url = data?.signedUrl ?? null;
    cache.set(slug, url);
    inflight.delete(slug);
    return url;
  })();
  inflight.set(slug, p);
  return p;
}

export function useLeaderPortraits(slugs: string[]): Record<string, string | null> {
  const key = slugs.slice().sort().join(",");
  const [map, setMap] = useState<Record<string, string | null>>(() => {
    const init: Record<string, string | null> = {};
    for (const s of slugs) if (cache.has(s)) init[s] = cache.get(s) ?? null;
    return init;
  });
  useEffect(() => {
    let mounted = true;
    Promise.all(
      slugs.map(async (s) => [s, await fetchPortrait(s)] as const),
    ).then((entries) => {
      if (!mounted) return;
      setMap((prev) => {
        const next = { ...prev };
        for (const [s, u] of entries) next[s] = u;
        return next;
      });
    });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return map;
}
