import { describe, expect, test } from "bun:test";
import { resolveLobbyIdentities, LEAGUE_QUEUE_MODES, LIVE_QUEUE_MINUTES } from "../src/lib/lfg-identities";

describe("Lobby identity display", () => {
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
});