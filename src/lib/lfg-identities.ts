import { UNKNOWN_NAME, leagueKey } from "@/lib/lfg-seats";

type Mapping = { discord_user_id: string | null; player_key: string | null; display_name: string | null; discord_username: string | null };
type Member = { discord_user_id: string; suggested_player_key: string | null; display_name: string; discord_username: string; global_name: string | null };

/** Directory suggestions are display hints only, never proof of membership or ownership. */
export function resolveLobbyIdentities(ids: string[], maps: Mapping[], members: Member[]) {
  const names: Record<string, string> = {};
  const keys: Record<string, string> = {};
  const handles: Record<string, string> = {};
  const verified: Record<string, boolean> = {};
  for (const id of ids) {
    const map = maps.find((m) => m.discord_user_id === id);
    const member = members.find((m) => m.discord_user_id === id);
    const key = map?.player_key?.trim() || member?.suggested_player_key?.trim();
    names[id] = map?.display_name?.trim() || map?.player_key?.trim() || member?.display_name?.trim() || member?.global_name?.trim() || member?.discord_username?.trim() || UNKNOWN_NAME;
    if (key) keys[id] = leagueKey(key);
    const handle = map?.discord_username?.trim() || member?.discord_username?.trim();
    if (handle) handles[id] = handle;
    verified[id] = !!map?.player_key;
  }
  return { names, keys, handles, verified };
}

export const LEAGUE_QUEUE_MODES = ["live"] as const;
export const LIVE_QUEUE_MINUTES = [5, 15, 30, 45, 60] as const;