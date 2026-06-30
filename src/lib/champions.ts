import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type TournamentWin = { tournament_num: number };
export type ChampionMap = Map<string, TournamentWin[]>; // key = player_name.toLowerCase().trim()

const norm = (s: string) => s.toLowerCase().trim();

let cache: ChampionMap | null = null;
let inflight: Promise<ChampionMap> | null = null;

export async function loadChampions(): Promise<ChampionMap> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const m: ChampionMap = new Map();
    const { data } = await supabase
      .from("past_tournament_results")
      .select("tournament_num, table_identifier, placement, player_name, round_type")
      .eq("round_type", "Finals")
      .eq("placement", 1);
    for (const r of (data ?? []) as Array<{
      tournament_num: number; table_identifier: string; placement: number; player_name: string; round_type: string;
    }>) {
      if (!/grand/i.test(r.table_identifier)) continue;
      const k = norm(r.player_name);
      const arr = m.get(k) ?? [];
      arr.push({ tournament_num: r.tournament_num });
      m.set(k, arr);
    }
    cache = m;
    return m;
  })();
  return inflight;
}

export function useChampions() {
  const [map, setMap] = useState<ChampionMap>(() => cache ?? new Map());
  useEffect(() => {
    let alive = true;
    void loadChampions().then((m) => { if (alive) setMap(new Map(m)); });
    return () => { alive = false; };
  }, []);
  return map;
}

/** A player is a "Hall of Fame Champion" once they've won 3+ grand finals. */
export function isChampion(map: ChampionMap, name: string): boolean {
  return (map.get(norm(name))?.length ?? 0) >= 3;
}

export function winCount(map: ChampionMap, name: string): number {
  return map.get(norm(name))?.length ?? 0;
}