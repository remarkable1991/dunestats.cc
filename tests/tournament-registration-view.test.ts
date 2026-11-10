import { describe, expect, test } from "bun:test";
import { registrationSearch, registrationOverrideKey, parseRegistrationOverrides } from "../src/lib/tournament-registration-view";
import { findRegistration, needsRegistrationUpdate, semiRegistrationReminder, type SemiRegistration, type Standing } from "../src/lib/tournament-semifinals";

const reg = (id: string, updated_at: string, name = "Diizz"): SemiRegistration => ({ id, direwolf_name: name, discord_username: "justdiizz", availability: [], updated_at });
const now = Date.parse("2026-11-10T08:16:00Z");

describe("Semi-finals registration updates", () => {
  test("newest exact duplicate supplies the November 9 availability", () => {
    const old = reg("old", "2026-10-24T12:27:14Z");
    const latest = { ...reg("new", "2026-11-09T17:53:03Z"), availability: ["2026-11-11T12:00:00Z"] };
    expect(findRegistration("diizz", null, [latest, old])).toEqual(latest);
    expect(findRegistration("diizz", null, [old, latest])).toEqual(latest);
  });
  test("ambiguous Discord matches to different names remain unresolved", () => {
    expect(findRegistration("unknown", "justdiizz", [reg("a", "2026-11-09T12:00:00Z"), reg("b", "2026-11-10T12:00:00Z", "SomeoneElse")])).toBeUndefined();
  });
  test("reminders include stale and missing registrations, not updates in the last seven days", () => {
    expect(needsRegistrationUpdate(reg("old", "2026-11-03T08:15:59Z"), now)).toBe(true);
    expect(needsRegistrationUpdate(reg("boundary", "2026-11-03T08:16:00Z"), now)).toBe(false);
    expect(needsRegistrationUpdate(reg("new", "2026-11-09T17:53:03Z"), now)).toBe(false);
    expect(needsRegistrationUpdate(undefined, now)).toBe(true);
  });
  test("reminder uses only selected semi-finalists and their manual registration selections", () => {
    const players = ["A", "B", "C"].map((player) => ({ player, discord: null } as Standing));
    const manual = reg("selected", "2026-11-09T12:00:00Z", "OtherName");
    const reminder = semiRegistrationReminder(20, players, (player) => player === "A" ? manual : player === "B" ? reg("old", "2026-10-24T12:00:00Z") : undefined, now);
    expect(reminder.pending.map((p) => p.player)).toEqual(["B", "C"]);
  });
  test("saved manual overrides round trip independently for each tournament", () => {
    const storage = new Map([[registrationOverrideKey(20), JSON.stringify({ Diizz: "new" })], [registrationOverrideKey(21), JSON.stringify({ Lorenzo99: "other" })]]);
    expect(parseRegistrationOverrides(storage.get(registrationOverrideKey(20)) ?? null)).toEqual({ Diizz: "new" });
    expect(parseRegistrationOverrides(storage.get(registrationOverrideKey(21)) ?? null)).toEqual({ Lorenzo99: "other" });
    expect(parseRegistrationOverrides("broken")).toEqual({});
  });
  test("all four explicit registration URL parameters select Tournament 20", () => {
    for (const key of ["t", "tournament", "tournament_num", "num"]) expect(registrationSearch({ [key]: "20" })).toEqual({ t: 20 });
    expect(registrationSearch({ t: "20", tournament: "21" })).toEqual({ t: 20 });
    expect(registrationSearch({})).toEqual({ t: undefined });
  });
});