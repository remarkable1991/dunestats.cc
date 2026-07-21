import { LEADERS } from "@/lib/leaders";

export type LeaderOrigin = "base" | "rise-of-ix" | "uprising";

export const ORIGIN_LABEL: Record<LeaderOrigin, string> = {
  base: "Base Dune",
  "rise-of-ix": "Rise of Ix",
  uprising: "Uprising",
};

export const ORIGIN_COLOR: Record<LeaderOrigin, string> = {
  base: "#D4A373",
  "rise-of-ix": "#4A90E2",
  uprising: "#A94444",
};

export function leaderSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const GROUP_TO_ORIGIN: Record<"base" | "ix" | "uprising", LeaderOrigin> = {
  base: "base",
  ix: "rise-of-ix",
  uprising: "uprising",
};

export type LeaderEntry = {
  name: string;
  origin: LeaderOrigin;
  slug: string;
};

export const ALL_LEADERS: LeaderEntry[] = (["base", "ix", "uprising"] as const).flatMap((g) =>
  (LEADERS[g] as readonly string[])
    .filter((n, i, arr) => arr.indexOf(n) === i)
    .map((name) => ({ name, origin: GROUP_TO_ORIGIN[g], slug: leaderSlug(name) })),
);

// Deduplicate (e.g. Reverend Mother Jessica / Lady Jessica share a slug branch — keep first)
const _seen = new Set<string>();
export const LEADER_INDEX: Record<string, LeaderEntry> = {};
for (const l of ALL_LEADERS) {
  const key = `${l.origin}/${l.slug}`;
  if (_seen.has(key)) continue;
  _seen.add(key);
  LEADER_INDEX[key] = l;
}

export function findLeader(origin: string, slug: string): LeaderEntry | null {
  return LEADER_INDEX[`${origin}/${slug}`] ?? null;
}

export function leaderRouteFor(name: string): { origin: LeaderOrigin; slug: string } | null {
  const s = leaderSlug(name);
  for (const l of ALL_LEADERS) if (l.slug === s) return { origin: l.origin, slug: l.slug };
  return null;
}
