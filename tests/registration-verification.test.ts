import { describe, expect, test } from "bun:test";
import { verifyRegistration, registrationTimezoneLabel } from "../src/lib/registration-verification";

const registration = { direwolf_name: "Nevic", discord_username: "@nevic_scythe" };
const member = { discord_user_id: "123", discord_username: "nevic_scythe", has_verified_map: false };
const mapping = { discord_user_id: "123", discord_username: "nevic_scythe", player_key: "nevic", display_name: "Nevic" };
describe("Registration verification", () => {
  test("authoritative mapping verifies the registered IGN and resolves overall game counts", () => {
    const result = verifyRegistration(registration, [mapping], [member], [{ player_key: "nevic", display_name: "Nevic", games_played: 142 }]);
    expect(result.discordStatus).toBe("verified");
    expect(result.rating?.games_played).toBe(142);
    expect(result.rating?.player_key).toBe("nevic");
  });
  test("guild presence alone does not verify an IGN", () => {
    expect(verifyRegistration(registration, [], [member], []).discordStatus).toBe("in-guild");
  });
  test("guild verified flag does not assert that this registration matches its IGN", () => {
    expect(verifyRegistration(registration, [], [{ ...member, has_verified_map: true }], []).discordStatus).toBe("mapped-in-guild");
  });
  test("wrong mapped IGN is flagged instead of verified", () => {
    expect(verifyRegistration({ ...registration, direwolf_name: "Kevin_spinti" }, [mapping], [member], []).discordStatus).toBe("mismatch");
  });
  test("punctuation-distinct Discord names cannot verify each other", () => {
    expect(verifyRegistration({ ...registration, discord_username: ".nevic_scythe" }, [mapping], [member], []).discordStatus).toBe("not-found");
  });
  test("member Discord ID resolves a renamed authoritative handle", () => {
    expect(verifyRegistration(registration, [{ ...mapping, discord_username: "old_handle" }], [member], []).discordStatus).toBe("verified");
  });
  test("Amsterdam displays the seasonal offset and missing zones remain explicit", () => {
    expect(registrationTimezoneLabel("Europe/Amsterdam", new Date("2026-10-22T12:19:00Z"))).toBe("Europe/Amsterdam (UTC+2)");
    expect(registrationTimezoneLabel(null)).toBe("Timezone not provided");
  });
});