export const LFG_ALERT_EVENTS = [
  { key: "opening", label: "New lobby openings" },
  { key: "own_open", label: "My queued lobby opens" },
  { key: "roster", label: "Players join or leave my lobby" },
  { key: "full", label: "My lobby becomes full (4/4)" },
  { key: "chat", label: "Chat and start votes in my lobby" },
  { key: "result", label: "My lobby result is reported" },
] as const;
export type LfgAlertPreferences = {
  browser_enabled: boolean;
  sound_enabled: boolean;
  discord_openings: boolean;
  event_kinds: string[];
  lobby_scope: string;
  email_until: string | null;
};
export const DEFAULT_LFG_ALERTS: LfgAlertPreferences = {
  browser_enabled: false, sound_enabled: false, discord_openings: false,
  event_kinds: ["own_open", "full", "chat", "result"], lobby_scope: "league", email_until: null,
};
export type LfgAlert = {
  id: string; lobby_id: number; title: string; body: string; kind: string;
  state: string; browser_received_at: string | null; email_due_at: string; expires_at: string;
};
export function mayEmailLfgAlert(alert: LfgAlert, now: number) {
  return alert.state === "pending" && !alert.browser_received_at &&
    Date.parse(alert.email_due_at) <= now && Date.parse(alert.expires_at) > now;
}
export function leagueStartAction(league: boolean, seats: number) {
  if (!league || seats >= 4) return "start";
  return seats === 3 ? "vote" : "none";
}
export function emailWindow(hours: number, now: number) {
  if (![1, 2, 4].includes(hours)) throw new Error("Choose 1, 2 or 4 hours");
  return new Date(now + hours * 3600000).toISOString();
}