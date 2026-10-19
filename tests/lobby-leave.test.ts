import { describe, expect, test } from "bun:test";
import { canLeaveLobby } from "../src/lib/lobby-leave";
import type { LfgRow } from "../src/lib/lfg-seats";

const row = { status: "searching", web_host_id: "host", host_id: "discord-host", web_player_ids: ["host", "player"], player_ids: ["discord-host", "discord-player"], guest_players: ["player"] } as unknown as LfgRow;
describe("Self-only lobby leave permissions", () => {
  test("a seated website player can leave", () => { expect(canLeaveLobby(row, "player", null)).toBe(true); });
  test("a verified Discord player can leave", () => { expect(canLeaveLobby(row, "linked", "discord-player")).toBe(true); });
  test("website hosts must cancel instead", () => { expect(canLeaveLobby(row, "host", null)).toBe(false); });
  test("Discord hosts must cancel instead", () => { expect(canLeaveLobby(row, "linked", "discord-host")).toBe(false); });
  test("names and guest matches do not grant access", () => { expect(canLeaveLobby({ ...row, web_player_ids: ["host"] }, "player", null)).toBe(false); });
  test("signed-out visitors cannot leave", () => { expect(canLeaveLobby(row, null, "discord-player")).toBe(false); });
  test("started lobbies cannot be left", () => { expect(canLeaveLobby({ ...row, status: "started" }, "player", null)).toBe(false); });
  test("cancelled lobbies cannot be left", () => { expect(canLeaveLobby({ ...row, status: "cancelled" }, "player", null)).toBe(false); });
});