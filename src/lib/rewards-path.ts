import { RECRUIT_EDITIONS, editionStatus, type RecruitEdition } from "@/lib/recruitment";

export type RewardsTab = "seasonal" | "lifetime" | "recruiters";

export type RewardsPath = {
  tab: RewardsTab;
  seasonId: number | null;
  editionId: RecruitEdition["id"] | null;
};

export function activeRecruitEdition(now = Date.now()): RecruitEdition {
  return (
    RECRUIT_EDITIONS.find((edition) => editionStatus(edition, now) === "active") ??
    RECRUIT_EDITIONS.find((edition) => editionStatus(edition, now) === "upcoming") ??
    RECRUIT_EDITIONS[0]!
  );
}

/** Parse canonical reward URLs and their slash-separated aliases. */
export function parseRewardsPath(splat: string | undefined, now = Date.now()): RewardsPath {
  const parts = (splat ?? "").split("/").filter(Boolean);
  const first = parts[0]?.toLowerCase() ?? "";
  const second = parts[1]?.toLowerCase() ?? "";

  if (first === "lifetime") return { tab: "lifetime", seasonId: null, editionId: null };

  if (first === "recruiters" || first.startsWith("recruiters-")) {
    const editionSlug = first === "recruiters" ? second : first.slice("recruiters-".length);
    const normalized = editionSlug.replace(/([^-])(\d{4})$/, "$1-$2");
    const edition = RECRUIT_EDITIONS.find((item) => item.id === normalized);
    return {
      tab: "recruiters",
      seasonId: null,
      editionId: edition?.id ?? activeRecruitEdition(now).id,
    };
  }

  const seasonSlug = first === "seasonal" || first === "season" ? second : first.startsWith("season-") ? first.slice(7) : "";
  const parsedSeason = /^\d+$/.test(seasonSlug) ? Number(seasonSlug) : null;
  return { tab: "seasonal", seasonId: parsedSeason, editionId: null };
}

export function rewardsSplat(tab: RewardsTab, seasonId?: number | null, editionId?: RecruitEdition["id"] | null): string {
  if (tab === "lifetime") return "lifetime";
  if (tab === "recruiters") {
    if (!editionId) return "recruiters";
    return `recruiters-${editionId.replace("-", "")}`;
  }
  return seasonId == null ? "seasonal" : `season-${seasonId}`;
}

export function rewardsHead(splat: string | undefined) {
  const path = parseRewardsPath(splat);
  const edition = RECRUIT_EDITIONS.find((item) => item.id === path.editionId);
  const title =
    path.tab === "lifetime"
      ? "Lifetime Rewards · Strategy Arena"
      : path.tab === "recruiters"
        ? `${edition?.label ?? "Current"} Recruiter Competition · Strategy Arena`
        : path.seasonId != null
          ? `Season ${path.seasonId} Rewards Ledger · Strategy Arena`
          : "Seasonal Rewards Ledger · Strategy Arena";
  const description =
    path.tab === "recruiters"
      ? `${edition?.label ?? "Current"} recruiter standings, competition rules and community prizes.`
      : path.tab === "lifetime"
        ? "All-time Strategy Points earned by playing, uploading, verifying, competing and recruiting."
        : "Seasonal Strategy Points standings and rewards, separate from Elo.";

  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  };
}
