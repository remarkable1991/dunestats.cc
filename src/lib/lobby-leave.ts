import type { LfgRow } from "@/lib/lfg-seats";

/** Name similarity and directory suggestions are never proof of seat ownership. */
export function canLeaveLobby(row: LfgRow, userId: string | null, discordId: string | null) {
  if (!userId || !["pending_creation", "posting", "searching"].includes(row.status)) return false;
  if (row.web_host_id === userId || (discordId && row.host_id === discordId)) return false;
  return (row.web_player_ids ?? []).includes(userId) || !!(discordId && (row.player_ids ?? []).includes(discordId));
}