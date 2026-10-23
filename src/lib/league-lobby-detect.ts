import { supabase } from "@/integrations/supabase/client";
import { SELECT_COLS, seatsOf, UNKNOWN_NAME, type LfgRow } from "@/lib/lfg-seats";
import { loadLobbyIdentities } from "@/lib/lfg-identity-loader";

const loose = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export type LobbyFormat = {
  board: "base" | "uprising";
  hasIx: boolean;
  hasImmortality: boolean;
  hasEpic: boolean;
  hasBaseLeaders: boolean;
  playMode: "live" | "async" | null;
};

export function lobbyFormat(row: Pick<LfgRow, "board_type" | "expansions" | "modules" | "mode">): LobbyFormat {
  const extras = [...(row.expansions ?? []), ...(row.modules ?? [])].join(" ").toLowerCase();
  const mode = (row.mode ?? "").toLowerCase();
  return {
    board: (row.board_type ?? "").toLowerCase().includes("uprising") ? "uprising" : "base",
    hasIx: /\bix\b|rise of ix/.test(extras),
    hasImmortality: extras.includes("immo"),
    hasEpic: extras.includes("epic"),
    hasBaseLeaders: extras.includes("base leader"),
    playMode: mode.includes("async") ? "async" : mode.includes("live") ? "live" : null,
  };
}

/** Count how many detected names match a seat (by name or player key, loosely). */
export function countSeatMatches(detected: string[], seats: Array<{ name: string; playerKey: string | null }>): string[] {
  const pool = seats.filter((s) => s.name !== UNKNOWN_NAME || s.playerKey);
  const used = new Set<number>();
  const hits: string[] = [];
  for (const d of detected) {
    const k = loose(d);
    if (!k) continue;
    const idx = pool.findIndex((s, i) => !used.has(i) && (loose(s.name) === k || (s.playerKey && loose(s.playerKey) === k)));
    if (idx >= 0) { used.add(idx); hits.push(pool[idx].name); }
  }
  return hits;
}

export type LobbyForUpload = { row: LfgRow; seatNames: string[] };

async function withSeats(row: LfgRow) {
  const ids = [...new Set([...(row.player_ids ?? []), row.host_id].filter(Boolean))];
  const idn = ids.length ? await loadLobbyIdentities(ids) : { names: {}, keys: {}, handles: {}, verified: {} };
  return seatsOf(row, idn.names, idn.keys, idn.handles, idn.verified);
}

export async function loadLobbyForUpload(id: number): Promise<LobbyForUpload | null> {
  const { data } = await supabase.from("active_async_matches").select(SELECT_COLS).eq("id", id).maybeSingle();
  if (!data) return null;
  const row = data as unknown as LfgRow;
  const seats = await withSeats(row);
  return { row, seatNames: seats.map((s) => s.name).filter((n) => n !== UNKNOWN_NAME) };
}

export type LeagueLobbyCandidate = { id: number; row: LfgRow; matched: string[] };

/** Find an unreported League lobby where at least 2 detected players are seated. */
export async function detectLeagueLobby(detected: string[]): Promise<LeagueLobbyCandidate | null> {
  if (detected.filter(Boolean).length < 2) return null;
  const since = new Date(Date.now() - 14 * 86400_000).toISOString();
  const { data } = await supabase
    .from("active_async_matches")
    .select(SELECT_COLS)
    .eq("is_league", true)
    .is("linked_game_id", null)
    .in("status", ["searching", "started", "posting", "pending_creation"])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(30);
  let best: LeagueLobbyCandidate | null = null;
  for (const raw of (data ?? []) as unknown as LfgRow[]) {
    const matched = countSeatMatches(detected, await withSeats(raw));
    if (matched.length >= 2 && (!best || matched.length > best.matched.length)) best = { id: raw.id, row: raw, matched };
  }
  return best;
}

/** Link a saved match to a lobby (marks it reported). */
export async function linkMatchToLobby(lobbyId: number, publicMatchId: string) {
  const { data, error } = await supabase.rpc("lfg_link_game" as never, { p_id: lobbyId, p_public_match_id: publicMatchId } as never);
  const res = data as { ok?: boolean; error?: string } | null;
  if (error || !res?.ok) throw new Error(res?.error ?? error?.message ?? "Could not link the match to the lobby");
}

/** In-memory hand-off of a pasted/dropped screenshot from a lobby page to /upload. */
let pending: { lobbyId: number; file: File } | null = null;
export const setPendingLobbyUpload = (v: typeof pending) => { pending = v; };
export const takePendingLobbyUpload = (lobbyId: number) => {
  const p = pending && pending.lobbyId === lobbyId ? pending.file : null;
  pending = null;
  return p;
};
