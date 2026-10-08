export type LfgRow = {
  id: number;
  match_id: string | null;
  message_id: string;
  channel_id: string;
  guild_id: string;
  host_id: string;
  status: string;
  message_text: string;
  lobby_password: string | null;
  board_type: string | null;
  expansions: string[] | null;
  modules: string[] | null;
  created_at: string;
  last_prompted_at: string | null;
  expires_at: string | null;
  auto_start_at: string | null;
  mode: string | null;
  player_ids: string[] | null;
  guest_players: string[] | null;
  web_host_id: string | null;
  web_player_ids: string[] | null;
  web_player_names: string[] | null;
  is_league: boolean | null;
  season_id: number | null;
  season_num: number | null;
  discord_usernames: string[] | null;
  expected_player_keys: string[] | null;
  league_status?: string | null;
  linked_game_id?: string | null;
};

export const SELECT_COLS =
  "id,match_id,message_id,channel_id,guild_id,host_id,status,message_text,lobby_password,board_type,expansions,modules,created_at,last_prompted_at,expires_at,auto_start_at,mode,player_ids,guest_players,web_host_id,web_player_ids,web_player_names,is_league,season_id,season_num,discord_usernames,expected_player_keys,league_status,linked_game_id";

export type Seat = {
  name: string;
  playerKey: string | null;
  web: boolean;
  discord: boolean;
  guest: boolean;
  host: boolean;
  discordId: string | null;
  discordHandle: string | null;
  webUserId: string | null;
};

export const UNKNOWN_NAME = "Unknown player name";
export const leagueKey = (name: string) => name.trim().toLowerCase();
// Loose comparison key: ignores case, spaces and punctuation ("Re Markable" == "remarkable")
const looseKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Builds a single merged roster from web seats, Discord seats and guest names.
 * The same person appearing through several sources collapses into one seat.
 */
export function seatsOf(
  r: LfgRow,
  discordNames: Record<string, string>,
  discordKeys: Record<string, string> = {},
): Seat[] {
  const webIds = r.web_player_ids ?? [];
  const seats: Seat[] = [];

  const sameSeat = (a: Seat, b: Seat) => {
    if (a.playerKey && b.playerKey && looseKey(a.playerKey) === looseKey(b.playerKey)) return true;
    if (a.name !== UNKNOWN_NAME && b.name !== UNKNOWN_NAME && looseKey(a.name) === looseKey(b.name)) return true;
    if (a.discordHandle && b.playerKey && looseKey(a.discordHandle) === looseKey(b.playerKey)) return true;
    if (b.discordHandle && a.playerKey && looseKey(b.discordHandle) === looseKey(a.playerKey)) return true;
    return false;
  };

  const add = (s: Seat, preferName: boolean) => {
    const existing = seats.find((x) => sameSeat(x, s));
    if (!existing) {
      seats.push(s);
      return;
    }
    existing.web ||= s.web;
    existing.discord ||= s.discord;
    existing.host ||= s.host;
    existing.guest = existing.guest && s.guest;
    existing.discordId ??= s.discordId;
    existing.discordHandle ??= s.discordHandle;
    existing.webUserId ??= s.webUserId;
    if ((preferName && s.name !== UNKNOWN_NAME) || existing.name === UNKNOWN_NAME) existing.name = s.name;
    if (s.playerKey && (preferName || !existing.playerKey)) existing.playerKey = s.playerKey;
  };

  // Discord seats first: the mapped IGN is the most reliable name
  (r.player_ids ?? []).forEach((id, i) => {
    const mapped = discordNames[id] && discordNames[id] !== UNKNOWN_NAME ? discordNames[id] : null;
    const expected = r.expected_player_keys?.[i]?.trim() || null;
    const handle = r.discord_usernames?.[i]?.trim() || null;
    add(
      {
        name: mapped ?? expected ?? handle ?? UNKNOWN_NAME,
        playerKey: discordKeys[id] || (mapped ? leagueKey(mapped) : expected ? leagueKey(expected) : null),
        web: false,
        discord: true,
        guest: false,
        host: id === r.host_id,
        discordId: id,
        discordHandle: handle,
        webUserId: null,
      },
      !!mapped,
    );
  });
  (r.web_player_names ?? []).forEach((n, i) => {
    const has = !!n?.trim();
    add(
      {
        name: has ? n : UNKNOWN_NAME,
        playerKey: has ? leagueKey(n) : null,
        web: true,
        discord: false,
        guest: false,
        host: !!r.web_host_id && webIds[i] === r.web_host_id,
        discordId: null,
        discordHandle: null,
        webUserId: webIds[i] ?? null,
      },
      false,
    );
  });
  (r.guest_players ?? []).forEach((n) => {
    const has = !!n?.trim();
    add(
      {
        name: has ? n : UNKNOWN_NAME,
        playerKey: has ? leagueKey(n) : null,
        web: false,
        discord: false,
        guest: true,
        host: false,
        discordId: null,
        discordHandle: null,
        webUserId: null,
      },
      false,
    );
  });

  // Only one host: prefer the website host when both are flagged
  const hosts = seats.filter((s) => s.host);
  if (hosts.length > 1) {
    const keep = hosts.find((s) => s.web && s.webUserId === r.web_host_id) ?? hosts[0];
    for (const s of hosts) if (s !== keep) s.host = false;
  }
  const hostIndex = seats.findIndex((s) => s.host);
  if (hostIndex > 0) seats.unshift(...seats.splice(hostIndex, 1));
  return seats.slice(0, 4);
}

/** True when the signed-in user is one of the lobby's players (web seat, linked Discord or claimed IGN). */
export function isMember(
  r: LfgRow,
  seats: Seat[],
  me: { userId: string | null; discordId: string | null; ign: string | null },
) {
  if (!me.userId) return false;
  if (r.web_host_id === me.userId || (r.web_player_ids ?? []).includes(me.userId)) return true;
  if (me.discordId && (r.host_id === me.discordId || (r.player_ids ?? []).includes(me.discordId))) return true;
  if (me.ign) {
    const k = looseKey(me.ign);
    if (seats.some((s) => (s.playerKey && looseKey(s.playerKey) === k) || looseKey(s.name) === k)) return true;
  }
  return false;
}

export function isHost(
  r: LfgRow,
  seats: Seat[],
  me: { userId: string | null; discordId: string | null; ign: string | null },
) {
  if (!me.userId) return false;
  if (r.web_host_id === me.userId) return true;
  if (me.discordId && r.host_id === me.discordId) return true;
  const host = seats.find((s) => s.host);
  if (host && me.ign) {
    const k = looseKey(me.ign);
    if ((host.playerKey && looseKey(host.playerKey) === k) || looseKey(host.name) === k) return true;
  }
  return false;
}
