export const STARTED_LOBBY_STATUSES = ["started", "reported", "completed"] as const;
export function canShowPlayedLobby(status: string, league: boolean, pilot: boolean) {
  return STARTED_LOBBY_STATUSES.some((value) => value === status) && (!league || pilot);
}
export function cleanMatchCode(value: string) {
  return value.trim().replace(/^#+/, "").trim();
}
export function isStartAwardForLobby(event: { action_type: string; metadata: unknown }, id: number) {
  if (!event.metadata || typeof event.metadata !== "object" || !("match_id" in event.metadata)) return false;
  return ["match_start_base", "first_live_game", "first_weekly_async"].includes(event.action_type) && String(event.metadata.match_id) === String(id);
}