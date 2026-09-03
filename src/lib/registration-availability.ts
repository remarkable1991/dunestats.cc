import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AvailabilityMap = Map<string, string[]>;

const norm = (s: string) => s.toLowerCase().trim();

/**
 * Live availability straight from each player's tournament registration form,
 * so edits made on /tournament-register/:num show up here immediately.
 */
export async function fetchRegistrationAvailability(
  tournamentNum: number,
  names: string[],
): Promise<AvailabilityMap> {
  const map: AvailabilityMap = new Map();
  if (!Number.isFinite(tournamentNum) || names.length === 0) return map;
  const { data, error } = await supabase.rpc("tournament_roster_registration_availability", {
    p_tournament_num: tournamentNum,
    p_player_names: names,
  });
  if (error || !data) return map;
  for (const row of data as { player_name: string; availability: unknown }[]) {
    const av = Array.isArray(row.availability) ? (row.availability as unknown[]).filter((x): x is string => typeof x === "string") : [];
    if (av.length > 0) map.set(norm(row.player_name), av);
  }
  return map;
}

export function useRegistrationAvailability(tournamentNum: number, names: string[]): AvailabilityMap {
  const key = names.map(norm).sort().join("\u0001");
  const [map, setMap] = useState<AvailabilityMap>(new Map());
  useEffect(() => {
    let cancelled = false;
    void fetchRegistrationAvailability(tournamentNum, names).then((m) => {
      if (!cancelled) setMap(m);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentNum, key]);
  return map;
}

/** Overlay registration availability onto roster rows, falling back to stored values. */
export function withRegistrationAvailability<T extends { player_name: string; player_availability: string[] | null }>(
  players: T[],
  map: AvailabilityMap,
): T[] {
  if (map.size === 0) return players;
  return players.map((p) => {
    const fresh = map.get(norm(p.player_name));
    return fresh ? { ...p, player_availability: fresh } : p;
  });
}
