import { describe, expect, it } from "vitest";
import { resolveUploaderNames } from "../src/lib/uploader-names";

describe("uploader name resolution", () => {
  it("uses the Discord-mapped IGN when no rating row is claimed", () => {
    expect(resolveUploaderNames([], [{ claimed_by: "u1", display_name: "EpicEric", player_key: "epiceric" }], [{ id: "u1", username: "eric_wegner" }])).toEqual({ u1: "EpicEric" });
  });
  it("prefers the claimed rating with the most games", () => {
    expect(resolveUploaderNames([
      { claimed_by: "u1", display_name: "Alt", games_played: 2 },
      { claimed_by: "u1", display_name: "Main", games_played: 40 },
    ], [{ claimed_by: "u1", display_name: "Mapped", player_key: "mapped" }], [])).toEqual({ u1: "Main" });
  });
  it("falls back to the account username last", () => {
    expect(resolveUploaderNames([], [], [{ id: "u2", username: "someone" }])).toEqual({ u2: "someone" });
  });
});
