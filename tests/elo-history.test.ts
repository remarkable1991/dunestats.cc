import { describe, expect, it } from "vitest";
import {
  leagueFormatChanges,
  rankHistorySummary,
  visibleLeagueFormatChanges,
  withRatingBaseline,
} from "../src/lib/elo-history";

describe("profile rating history", () => {
  it("starts a full history at the 1000 ELO baseline", () => {
    const chart = withRatingBaseline([
      { kind: "game", x: 100, rating: 1018, delta: 18 },
      { kind: "game", x: 200, rating: 1008, delta: -10 },
    ]);
    expect(chart[0]).toMatchObject({ kind: "baseline", label: "Start", rating: 1000, delta: 0 });
    expect(chart).toHaveLength(3);
  });

  it("starts a window at the rating held before its first visible game", () => {
    const chart = withRatingBaseline([
      { kind: "game", x: 100, rating: 1035, delta: -15 },
      { kind: "game", x: 200, rating: 1055, delta: 20 },
    ]);
    expect(chart[0]).toMatchObject({ kind: "baseline", rating: 1050 });
  });

  it("uses after-game ranks for first, peak and latest rank summaries", () => {
    expect(rankHistorySummary([
      { rankAfter: 19 },
      { rankAfter: 4 },
      { rankAfter: null },
      { rankAfter: 7 },
    ])).toEqual({ first: 19, peak: 4, latest: 7 });
  });
});

describe("League format changes", () => {
  const presets = [
    { id: 1, name: "Season 1 Part 1", start_date: "2026-11-01T00:00:00Z", expansions: ["Immortality"] },
    { id: 2, name: "Season 1 Part 2", start_date: "2026-11-22T07:00:00Z", expansions: ["Rise of IX", "Immortality"] },
    { id: 3, name: "Season 1 Part 3", start_date: "2026-12-15T07:00:00Z", expansions: ["Rise of IX"] },
  ];

  it("marks only actual transitions within the visible game history", () => {
    const markers = leagueFormatChanges(
      presets,
      new Date("2026-11-10T00:00:00Z").getTime(),
      new Date("2026-11-30T00:00:00Z").getTime(),
    );
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({ id: 2, label: "Part 2" });
  });

  it("keeps a transition that falls on the last visible game", () => {
    const transition = new Date("2026-11-22T07:00:00Z").getTime();
    expect(leagueFormatChanges(presets, transition - 1000, transition)).toHaveLength(1);
  });

  it("shows a newly effective format on the last old-format game", () => {
    const transition = new Date("2026-11-22T07:00:00Z").getTime();
    const markers = visibleLeagueFormatChanges(
      presets,
      new Date("2026-11-01T00:00:00Z").getTime(),
      transition - 3600000,
      transition + 3600000,
    );
    expect(markers.map((marker) => marker.id)).toEqual([2]);
  });

  it("does not announce a future format on the current last game", () => {
    const transition = new Date("2026-11-22T07:00:00Z").getTime();
    const markers = visibleLeagueFormatChanges(
      presets,
      new Date("2026-11-01T00:00:00Z").getTime(),
      transition + 3600000,
      transition + 7200000,
    );
    expect(markers.map((marker) => marker.id)).toEqual([2]);
  });
});
