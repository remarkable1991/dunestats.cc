import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const TITLE_TIERS: { name: string; min: number; color: string }[] = [
  { name: "Spiceworker", min: 0, color: "#a37a5c" },
  { name: "Trooper", min: 250, color: "#607d8b" },
  { name: "Fedaykin", min: 1000, color: "#1abc9c" },
  { name: "Mentat", min: 2500, color: "#9b59b6" },
  { name: "Swordmaster", min: 5000, color: "#961a0c" },
  { name: "Kwisatz Haderach", min: 10000, color: "#f1c40f" },
];

export function titleColor(lifetime: number | null | undefined): string {
  const v = Number(lifetime ?? 0);
  let color = TITLE_TIERS[0].color;
  for (const t of TITLE_TIERS) if (v >= t.min) color = t.color;
  return color;
}

export function titleName(lifetime: number | null | undefined): string {
  const v = Number(lifetime ?? 0);
  let name = TITLE_TIERS[0].name;
  for (const t of TITLE_TIERS) if (v >= t.min) name = t.name;
  return name;
}

let cache: Promise<Map<string, number>> | null = null;

function loadTitles(): Promise<Map<string, number>> {
  if (cache) return cache;
  cache = (async () => {
    const map = new Map<string, number>();
    const PAGE = 1000;
    let from = 0;
    // paginate through player_sp
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await supabase
        .from("player_sp")
        .select("player_key, lifetime_sp")
        .range(from, from + PAGE - 1);
      if (error || !data || data.length === 0) break;
      for (const r of data as { player_key: string; lifetime_sp: number }[]) {
        const prev = map.get(r.player_key) ?? 0;
        if (r.lifetime_sp > prev) map.set(r.player_key, r.lifetime_sp);
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return map;
  })();
  return cache;
}

export function usePlayerTitles(): Map<string, number> {
  const [map, setMap] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    let mounted = true;
    loadTitles().then((m) => {
      if (mounted) setMap(new Map(m));
    });
    return () => {
      mounted = false;
    };
  }, []);
  return map;
}

export function colorForKey(map: Map<string, number>, key: string | null | undefined): string | undefined {
  if (!key) return undefined;
  const lifetime = map.get(key.toLowerCase().trim());
  if (lifetime === undefined) return undefined;
  return titleColor(lifetime);
}
