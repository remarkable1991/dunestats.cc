import { Lock } from "lucide-react";

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
  missing_items: string[] | null;
};

export const TIER_ICON: Record<string, string> = {
  Bronze: "🥉",
  Silver: "🥈",
  Gold: "🥇",
  Platinum: "💎",
};

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

export function AchievementBadge({ a, featured = false }: { a: Achievement; featured?: boolean }) {
  const pct = Math.round(ratio(a) * 100);
  const missing = (a.missing_items ?? []).filter(Boolean);
  const showMissing = !a.is_unlocked && missing.length > 0;

  return (
    <div
      className={`relative overflow-hidden rounded-lg border p-4 transition ${
        RARITY_STYLE[a.rarity] ?? RARITY_STYLE.Common
      } ${a.is_unlocked ? "" : "opacity-95"} ${featured ? "ring-1 ring-sand/30" : ""}`}
    >
      {!a.is_unlocked && (
        <div className="pointer-events-none absolute inset-0 bg-background/50" aria-hidden />
      )}
      <div className="relative">
        <div className="flex items-start gap-2">
          <span className="text-xl leading-none" aria-hidden>
            {TIER_ICON[a.tier] ?? "🏅"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-sm truncate">{a.title}</h3>
              {!a.is_unlocked && <Lock className="size-3.5 text-muted-foreground shrink-0" />}
            </div>
            <div className="text-[11px] uppercase tracking-wider flex items-center gap-2">
              <span className={RARITY_TEXT[a.rarity] ?? RARITY_TEXT.Common}>{a.rarity}</span>
              <span className="text-muted-foreground">· {a.category}</span>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-2">{a.description}</p>

        <div className="mt-3">
          <div className="h-2 w-full rounded-full bg-secondary/60 overflow-hidden">
            <div
              className={`h-full rounded-full ${
                a.is_unlocked ? "bg-teal" : "bg-sand"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
            <span>
              {Math.min(a.current, a.target)} / {a.target}
            </span>
            <span>{a.is_unlocked ? "Unlocked" : `${pct}%`}</span>
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
