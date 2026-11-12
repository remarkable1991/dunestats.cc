import { describe, expect, it } from "vitest";
import { manualRowsFromSeats, reorderLobbyRows } from "../src/lib/lobby-manual-result";

describe("manual lobby result entry", () => {
  it("prefills all four seated players in lobby order with editable leaders and VP", () => {
    expect(manualRowsFromSeats([
      { name: "mxp01", playerKey: "mxp01" },
      { name: "Gabriel", playerKey: "gabriel" },
      { name: "beast", playerKey: "beast" },
      { name: "Spellcastermax", playerKey: "spellcastermax" },
    ])).toEqual([
      { placement: 1, player_name: "mxp01", leader_name: "", points: 0 },
      { placement: 2, player_name: "Gabriel", leader_name: "", points: 0 },
      { placement: 3, player_name: "beast", leader_name: "", points: 0 },
      { placement: 4, player_name: "Spellcastermax", leader_name: "", points: 0 },
    ]);
  });

  it("moves a player to a new rank and renumbers every placement", () => {
    const rows = manualRowsFromSeats([
      { name: "mxp01", playerKey: "mxp01" },
      { name: "Gabriel", playerKey: "gabriel" },
      { name: "beast", playerKey: "beast" },
      { name: "Spellcastermax", playerKey: "spellcastermax" },
    ]);
    const reordered = reorderLobbyRows(rows, 3, 0);
    expect(reordered.map((row) => row.player_name)).toEqual(["Spellcastermax", "mxp01", "Gabriel", "beast"]);
    expect(reordered.map((row) => row.placement)).toEqual([1, 2, 3, 4]);
  });
});
