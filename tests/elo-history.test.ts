import { describe, expect, it } from "vitest";
import {
  leagueFormatChanges,
  leagueSeasonParts,
  pointsInLeaguePeriod,
  rankHistorySummary,
  visibleLeagueFormatChanges,
  withRatingBaseline,
} from "../src/lib/elo-history";

const presets = [
  {
    id: 1,
    name: "Season 1 Part 1",
    start_date: "2026-11-01T00:00:00Z",
    end_date: "2026-11-22T07:00:00Z",
    expansions: ["Immortality"],
  },
  {
    id: 2,
    name: "Season 1 Part 2",
    start_date: "2026-11-22T07:00:00Z",
    end_date: "2027-01-25T07:00:00Z",
    expansions: ["Rise of IX", "Immortality"],
  },
  {
    id: 3,
    name: "Season 1 Part 3",
    start_date: "2026-12-15T07:00:00Z",
    end_date: "2027-01-25T07:00:00Z",
    expansions: ["Rise of IX"],
  },
  {
    id: 4,
    name: "Season 2 Part 1",
    start_date: "2027-02-01T07:00:00Z",
    end_date: "2027-03-01T07:00:00Z",
    expansions: [],
  },
];

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

describe("League season parts", () => {
  const points = [
    { x: new Date("2026-11-10T00:00:00Z").getTime(), rating: 1018, delta: 18, rankAfter: 19 },
    { x: new Date("2026-11-22T06:59:59Z").getTime(), rating: 1030, delta: 12, rankAfter: 12 },
    { x: new Date("2026-11-22T07:00:00Z").getTime(), rating: 1020, delta: -10, rankAfter: 15 },
    { x: new Date("2026-12-20T07:00:00Z").getTime(), rating: 1040, delta: 20, rankAfter: 8 },
  ];

  it("creates Part 1, Part 2 and Part 3 only for the selected season", () => {
    const parts = leagueSeasonParts(presets, 1);
    expect(parts.map((part) => part.label)).toEqual(["Part 1", "Part 2", "Part 3"]);
    expect(parts[1]).toMatchObject({
      start: new Date("2026-11-22T07:00:00Z").getTime(),
      end: new Date("2026-12-15T07:00:00Z").getTime(),
    });
  });

  it("puts a game at the exact transition time into the new part", () => {
    const parts = leagueSeasonParts(presets, 1);
    const part1 = parts[0];
    const part2 = parts[1];
    expect(part1 && pointsInLeaguePeriod(points, part1)).toHaveLength(2);
    expect(part2 && pointsInLeaguePeriod(points, part2)).toHaveLength(1);
    expect(part2 && pointsInLeaguePeriod(points, part2)[0]?.rankAfter).toBe(15);
  });

  it("starts Part 1 at 1000 ELO", () => {
    const part1 = leagueSeasonParts(presets, 1)[0];
    const visible = part1 ? pointsInLeaguePeriod(points, part1) : [];
    expect(withRatingBaseline(visible)[0]).toMatchObject({ rating: 1000 });
  });

  it("starts Part 2 at the rating carried over from Part 1", () => {
    const part2 = leagueSeasonParts(presets, 1)[1];
    const visible = part2 ? pointsInLeaguePeriod(points, part2) : [];
    expect(withRatingBaseline(visible)[0]).toMatchObject({ rating: 1030 });
  });

  it("scopes after-game rank summaries to the selected part", () => {
    const part2 = leagueSeasonParts(presets, 1)[1];
    const visible = part2 ? pointsInLeaguePeriod(points, part2) : [];
    expect(rankHistorySummary(visible)).toEqual({ first: 15, peak: 15, latest: 15 });
  });
});

describe("League format changes", () => {
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
