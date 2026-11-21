export type LeagueEntry = { player_key: string; season: number; games_played: number };

export function seasonTournamentEligibility(name: string, season: number, minimum: number, rows: LeagueEntry[], claimedKeys: string[]) {
  const key = name.trim().toLowerCase();
  const games = rows.find((r) => r.player_key === key && r.season === season)?.games_played ?? 0;
  const claimed = claimedKeys.includes(key);
  return { games, claimed, eligible: claimed && games >= minimum };
}

export function seasonPrizeAmount(summary: { tournament_total: number | string }) {
  return Number(summary.tournament_total);
}

export const SEASON_FORMAT_DISCUSSION = "https://discord.com/channels/747212662483583069/1570554778734301244";