import { describe, expect, test } from "bun:test";
import { resolveLobbyIdentities, LEAGUE_QUEUE_MODES, LIVE_QUEUE_MINUTES } from "../src/lib/lfg-identities";
import { isHost, isMember, type LfgRow, type Seat } from "../src/lib/lfg-seats";

describe("Lobby identity display", () => {
  test("missing guild names remain identifiable without inventing an IGN", () => {
    const result = resolveLobbyIdentities(["123456789"], [], []);
    expect(result.names["123456789"]).toBe("Discord user 123456789");
    expect(result.keys["123456789"]).toBeUndefined();
    expect(result.verified["123456789"]).toBe(false);
  });
  const member = { discord_user_id: "236215014019563520", display_name: "BLUDGEON", discord_username: "bludgeon_", global_name: null, suggested_player_key: "bludgeon" };
  test("guild suggestions provide a name and rating key without becoming verified", () => {
    const result = resolveLobbyIdentities([member.discord_user_id], [], [member]);
    expect(result.names[member.discord_user_id]).toBe("BLUDGEON");
    expect(result.keys[member.discord_user_id]).toBe("bludgeon");
    expect(result.verified[member.discord_user_id]).toBe(false);
  });
  test("verified mappings override guild suggestions", () => {
    const result = resolveLobbyIdentities([member.discord_user_id], [{ discord_user_id: member.discord_user_id, display_name: "Correct Name", player_key: "correct", discord_username: "correct_handle" }], [member]);
    expect(result.names[member.discord_user_id]).toBe("Correct Name");
    expect(result.keys[member.discord_user_id]).toBe("correct");
    expect(result.verified[member.discord_user_id]).toBe(true);
  });
  test("League queue is live only", () => { expect([...LEAGUE_QUEUE_MODES]).toEqual(["live"]); });
  test("Live queue timer choices stay 5, 15, 30, 45 and 60 minutes", () => { expect([...LIVE_QUEUE_MINUTES]).toEqual([5,15,30,45,60]); });
  test("suggested IGN never grants membership or host permissions", () => {
    const row = { web_host_id: null, web_player_ids: [], host_id: "discord", player_ids: ["discord"] } as unknown as LfgRow;
    const seats: Seat[] = [{ name: "BLUDGEON", playerKey: "bludgeon", web: false, discord: true, guest: false, host: true, discordId: "discord", discordHandle: "bludgeon_", webUserId: null, identityVerified: false }];
    const me = { userId: "other-account", discordId: null, ign: "BLUDGEON" };
    expect(isMember(row, seats, me)).toBe(false);
    expect(isHost(row, seats, me)).toBe(false);
  });
});