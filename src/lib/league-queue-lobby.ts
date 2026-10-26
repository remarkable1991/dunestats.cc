import type { LfgRow } from "@/lib/lfg-seats";

/** Match the existing queue RPC's capacity and oldest-first selection. */
export function oldestQueueLobby(rows: LfgRow[], mode: string, now: number): LfgRow | null {
  return rows.filter((row) => row.is_league && row.mode === mode
    && ["searching", "pending_creation"].includes(row.status)
    && (!row.expires_at || new Date(row.expires_at).getTime() > now)
    && (row.player_ids?.length ?? 0) + (row.guest_players?.length ?? 0) + (row.web_player_names?.length ?? 0) < 4)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id)[0] ?? null;
}