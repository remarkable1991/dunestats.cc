import { useEffect, useMemo, useState } from "react";
import { Lock } from "lucide-react";
import { RankEmblem } from "@/components/RankEmblem";

export type AchievementTier = {
  tier: string;
  req: string | null;
  target: number;
  current: number;
  is_unlocked: boolean;
  description?: string | null;
  missing_items?: string[] | null;
  sp_reward?: number | null;
};

export type Achievement = {
  id: string;
  tier: "Bronze" | "Silver" | "Gold" | "Platinum" | string;
  title: string;
  rarity: "Common" | "Uncommon" | "Rare" | "Legendary" | string;
  target: number;
  current: number;
  category: string;
  description: string;
  is_unlocked: boolean;
  is_seasonal?: boolean | null;
  tags?: string[] | null;
  sp_reward?: number | null;
  missing_items: string[] | null;
  tiers?: AchievementTier[] | null;
};

export const TIER_ICON: Record<string, string> = {
  Bronze: "🥉",
  Silver: "🥈",
  Gold: "🥇",
  Platinum: "💎",
};

export const TIER_ORDER = ["Bronze", "Silver", "Gold", "Platinum"];

const RARITY_STYLE: Record<string, string> = {
  Common: "border-border/70 bg-card/60",
  Uncommon: "border-[#b87333]/60 bg-[#b87333]/5",
  Rare: "border-cyan-400/50 bg-cyan-400/5 shadow-[0_0_15px_rgba(6,182,212,0.2)]",
  Legendary:
    "border-violet-400/60 bg-violet-500/10 ring-1 ring-violet-400/30 shadow-[0_0_22px_rgba(139,92,246,0.28)]",
};

const RARITY_TEXT: Record<string, string> = {
  Common: "text-muted-foreground",
  Uncommon: "text-[#d08b4a]",
  Rare: "text-cyan-300",
  Legendary: "text-violet-300",
};

export function ratio(a: Achievement) {
  if (!a.target) return 0;
  return Math.min(1, a.current / a.target);
}

function sortTiers(tiers: AchievementTier[]) {
  return [...tiers].sort(
    (x, y) => TIER_ORDER.indexOf(x.tier) - TIER_ORDER.indexOf(y.tier),
  );
}

/** Tier that should be selected by default: first in-progress, else highest unlocked. */
function defaultTierIndex(tiers: AchievementTier[]) {
  const firstLocked = tiers.findIndex((t) => !t.is_unlocked);
  if (firstLocked !== -1) return firstLocked;
  return tiers.length - 1;
}

export function AchievementBadge({ a, featured = false }: { a: Achievement; featured?: boolean }) {
  const tiers = useMemo(() => sortTiers(a.tiers ?? []), [a.tiers]);
  const [active, setActive] = useState(() => (tiers.length ? defaultTierIndex(tiers) : 0));
  useEffect(() => {
    setActive(tiers.length ? defaultTierIndex(tiers) : 0);
  }, [tiers]);

  const sel = tiers[active];
  const current = sel ? sel.current : a.current;
  const target = sel ? sel.target : a.target;
  const unlocked = sel ? sel.is_unlocked : a.is_unlocked;
  const tierName = sel ? sel.tier : a.tier;
  const pct = target ? Math.round(Math.min(1, current / target) * 100) : 0;
  const spReward = (sel?.sp_reward ?? a.sp_reward) ?? null;

  const missing = ((sel ? sel.missing_items : a.missing_items) ?? []).filter(Boolean);
  const showMissing = !unlocked && missing.length > 0;

  const baseDescription = sel?.description ?? a.description;
  const description = sel?.req
    ? `(${sel.tier} Target) ${sel.req} — ${baseDescription.replace(/^\([^)]*\)\s*/, "")}`
    : baseDescription;

  return (
    <div
      className={`relative overflow-hidden rounded-lg border p-4 transition ${
        RARITY_STYLE[a.rarity] ?? RARITY_STYLE.Common
      } ${unlocked ? "ring-2 ring-sand/60" : "opacity-95"} ${featured ? "ring-1 ring-sand/30" : ""}`}
    >
      {!unlocked && (
        <div className="pointer-events-none absolute inset-0 bg-background/50" aria-hidden />
      )}
      <div className="relative">
        <div className="flex items-start gap-2">
          <RankEmblem tier={tierName} size={34} muted={!unlocked} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-sm truncate">{a.title}</h3>
              {!unlocked && <Lock className="size-3.5 text-muted-foreground shrink-0" />}
            </div>
            <div className="text-[11px] uppercase tracking-wider flex items-center gap-2">
              <span className={RARITY_TEXT[a.rarity] ?? RARITY_TEXT.Common}>{a.rarity}</span>
              <span className="text-muted-foreground">· {a.category}</span>
            </div>
          </div>
        </div>

        {tiers.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {tiers.map((t, i) => {
              const isActive = i === active;
              const future = !t.is_unlocked && i > defaultTierIndex(tiers);
              return (
                <button
                  key={t.tier}
                  type="button"
                  onClick={() => setActive(i)}
                  aria-pressed={isActive}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider transition ${
                    isActive
                      ? "border-sand/70 bg-sand/15 text-sand"
                      : "border-border/60 bg-secondary/40 text-muted-foreground hover:border-sand/40"
                  } ${future ? "opacity-60" : ""}`}
                >
                  <RankEmblem tier={t.tier} size={14} muted={!t.is_unlocked} />
                  {t.tier}
                  {!t.is_unlocked && <Lock className="size-2.5" />}
                </button>
              );
            })}
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-2">{description}</p>

        {spReward != null && (
          <div className="mt-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                unlocked
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  : "bg-sand/10 text-sand border-sand/30"
              }`}
            >
              {unlocked ? `\u2713 +${spReward} SP Earned` : `\u26A1 Reward: +${spReward} SP`}
            </span>
          </div>
        )}

        <div className="mt-3">
          <div className="h-2 w-full rounded-full bg-secondary/60 overflow-hidden">
            <div
              className={`h-full rounded-full ${unlocked ? "bg-teal" : "bg-sand"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
            <span>
              {Math.min(current, target)} / {target}
            </span>
            <span>{unlocked ? "Unlocked" : `${pct}%`}</span>
          </div>
        </div>

        {showMissing && (
          <div className="mt-3 flex flex-wrap gap-1">
            {missing.slice(0, 8).map((m) => (
              <span
                key={m}
                className="rounded-full border border-border/60 bg-secondary/40 px-2 py-0.5 text-[10px] text-muted-foreground"
              >
                Need: {m}
              </span>
            ))}
            {missing.length > 8 && (
              <span className="text-[10px] text-muted-foreground">+{missing.length - 8} more</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
