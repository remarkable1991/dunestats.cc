import { expect, test } from "bun:test";
import { canShowPlayedLobby, cleanMatchCode, isStartAwardForLobby } from "../src/lib/lfg-history";
test("normal history excludes failed and waiting lobbies", () => {
  expect(canShowPlayedLobby("started", false, false)).toBe(true);
  for (const status of ["cancelled", "timed_out", "searching", "pending_creation", "posting"]) expect(canShowPlayedLobby(status, false, false)).toBe(false);
});
test("League history remains pilot only", () => {
  expect(canShowPlayedLobby("started", true, false)).toBe(false);
  expect(canShowPlayedLobby("started", true, true)).toBe(true);
});
test("match codes accept the hash prefix", () => expect(cleanMatchCode(" #DESERT-MAKER-9440 ")).toBe("DESERT-MAKER-9440"));
test("start rollback targets only the selected lobby and start award types", () => {
  expect(isStartAwardForLobby({ action_type: "match_start_base", metadata: { match_id: 181 } }, 181)).toBe(true);
  expect(isStartAwardForLobby({ action_type: "first_live_game", metadata: { match_id: "181" } }, 181)).toBe(true);
  expect(isStartAwardForLobby({ action_type: "first_weekly_async", metadata: { match_id: 181 } }, 181)).toBe(true);
  expect(isStartAwardForLobby({ action_type: "match_start_base", metadata: { match_id: 182 } }, 181)).toBe(false);
  expect(isStartAwardForLobby({ action_type: "referral", metadata: { match_id: 181 } }, 181)).toBe(false);
});