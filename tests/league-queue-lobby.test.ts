import { expect, test } from "bun:test";
import { oldestQueueLobby } from "../src/lib/league-queue-lobby";
import type { LfgRow } from "../src/lib/lfg-seats";

const now = Date.parse("2026-10-26T09:33:00Z");
const lobby = (id: number, overrides: Partial<LfgRow> = {}): LfgRow => ({
  id, is_league: true, mode: "live", status: "searching", created_at: `2026-10-26T0${id}:00:00Z`,
  expires_at: null, player_ids: ["host"], guest_players: [], web_player_names: [], ...overrides,
} as LfgRow);

test("only the oldest available League game is selected", () => {
  expect(oldestQueueLobby([lobby(3), lobby(1), lobby(2)], "live", now)?.id).toBe(1);
});
test("full, expired, started, casual and other-mode games are excluded", () => {
  expect(oldestQueueLobby([
    lobby(1, { player_ids: ["a", "b"], guest_players: ["c"], web_player_names: ["d"] }),
    lobby(2, { expires_at: "2026-10-26T09:33:00Z" }),
    lobby(3, { status: "started" }), lobby(4, { is_league: false }), lobby(5, { mode: "async" }),
    lobby(6, { status: "pending_creation" }),
  ], "live", now)?.id).toBe(6);
});
test("no available game returns to queue mode", () => {
  expect(oldestQueueLobby([lobby(1, { status: "cancelled" })], "live", now)).toBeNull();
});