export type RatingHistoryPoint = {
  x: number;
  rating: number;
  delta: number;
};

export type RatingBaselinePoint = RatingHistoryPoint & {
  kind: "baseline";
  label: "Start";
};

/** Adds the rating held immediately before the first visible game. */
export function withRatingBaseline<T extends RatingHistoryPoint>(
  points: readonly T[],
): Array<T | RatingBaselinePoint> {
  const first = points[0];
  if (!first) return [];
  return [
    {
      kind: "baseline",
      label: "Start",
      x: first.x - 1,
      rating: Math.round((first.rating - first.delta) * 10) / 10,
      delta: 0,
    },
    ...points,
  ];
}

export function rankHistorySummary(
  points: readonly { rankAfter: number | null }[],
): { first: number | null; peak: number | null; latest: number | null } {
  const ranks = points
    .map((point) => point.rankAfter)
    .filter((rank): rank is number => rank != null && rank > 0);
  if (!ranks.length) return { first: null, peak: null, latest: null };
  return {
    first: ranks[0] ?? null,
    peak: Math.min(...ranks),
    latest: ranks[ranks.length - 1] ?? null,
  };
}

export type LeagueFormatPreset = {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  expansions: string[] | null;
};

export type LeaguePeriod = {
  key: string;
  id: number;
  label: string;
  start: number;
  end: number;
};

export function leaguePresetSeason(name: string): number | null {
  const match = name.match(/^Season\s+(\d+)\b/i);
  return match?.[1] ? Number(match[1]) : null;
}

export function formatChangeLabel(name: string): string {
  return name.replace(/^Season\s+\d+\s*[-–—:]?\s*/i, "").trim() || name;
}

/** Builds consecutive, end-exclusive format periods for one League season. */
export function leagueSeasonParts(
  presets: readonly LeagueFormatPreset[],
  season: number | null,
): LeaguePeriod[] {
  if (season == null) return [];
  const chronological = presets
    .filter((preset) => leaguePresetSeason(preset.name) === season)
    .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime() || a.id - b.id);
  return chronological.flatMap((preset, index) => {
    const start = new Date(preset.start_date).getTime();
    const end = new Date(chronological[index + 1]?.start_date ?? preset.end_date).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
    return [{
      key: String(preset.id),
      id: preset.id,
      label: formatChangeLabel(preset.name),
      start,
      end,
    }];
  });
}

export function pointsInLeaguePeriod<T extends { x: number }>(
  points: readonly T[],
  period: LeaguePeriod,
): T[] {
  return points.filter((point) => point.x >= period.start && point.x < period.end);
}

/** Returns real preset transitions, excluding the initial preset and changes outside the visible games. */
export function leagueFormatChanges(
  presets: readonly LeagueFormatPreset[],
  from: number,
  to: number,
): Array<LeagueFormatPreset & { x: number; label: string }> {
  const chronological = [...presets].sort(
    (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime() || a.id - b.id,
  );
  return chronological.slice(1).flatMap((preset) => {
    const x = new Date(preset.start_date).getTime();
    if (!Number.isFinite(x) || x < from || x > to) return [];
    return [{ ...preset, x, label: formatChangeLabel(preset.name) }];
  });
}

/** Includes the first already-effective transition after the last game, anchored to that old-format game. */
export function visibleLeagueFormatChanges(
  presets: readonly LeagueFormatPreset[],
  from: number,
  lastGame: number,
  now: number,
): Array<LeagueFormatPreset & { x: number; label: string }> {
  const effective = leagueFormatChanges(presets, from, now);
  const nextAfterLastGame = effective.find((marker) => marker.x > lastGame);
  return effective.filter((marker) => marker.x <= lastGame || marker === nextAfterLastGame);
}
