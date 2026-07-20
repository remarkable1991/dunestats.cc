import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TITLE_TIERS } from "@/lib/player-title";
import { SpLearnMore } from "./SpLearnMore";

function titleFor(lifetime: number) {
  let current = TITLE_TIERS[0];
  let next: (typeof TITLE_TIERS)[number] | null = null;
  for (let i = 0; i < TITLE_TIERS.length; i++) {
    if (lifetime >= TITLE_TIERS[i].min) {
      current = TITLE_TIERS[i];
      next = TITLE_TIERS[i + 1] ?? null;
    }
  }
  return { current, next };
}

export function SpProgress({ userId }: { userId: string }) {
  const [lifetime, setLifetime] = useState(0);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("player_sp")
        .select("lifetime_sp")
        .eq("claimed_by", userId);
      if (cancelled) return;
      const life = (data ?? []).reduce((s, r) => s + (r.lifetime_sp ?? 0), 0);
      setLifetime(life);
      requestAnimationFrame(() => setAnimate(true));
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const { current, next } = titleFor(lifetime);
  const tierFloor = current.min;
  const tierCeil = next?.min ?? current.min;
  const tierPct = next
    ? Math.min(100, Math.max(0, ((lifetime - tierFloor) / (tierCeil - tierFloor)) * 100))
    : 100;

  return (
    <Card className="p-5 border-sand/40 bg-gradient-to-br from-card to-card/40 mt-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-sand" />
          <h2 className="font-display text-lg">Strategy Points</h2>
        </div>
        <SpLearnMore />
      </div>

      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border border-sand/40 bg-sand/10 px-3 py-1 text-sm font-medium"
          style={{ color: current.color }}
        >
          {current.name}
        </span>
        <span className="text-xs text-muted-foreground">
          {lifetime.toLocaleString()} lifetime SP
        </span>
      </div>

      <div className="space-y-4">
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-muted-foreground">
              {next ? (
                <>
                  Progress to <span style={{ color: next.color }}>{next.name}</span>
                </>
              ) : (
                "Max title reached"
              )}
            </span>
            <span className="text-foreground font-mono">
              {next
                ? `${lifetime.toLocaleString()} / ${tierCeil.toLocaleString()} SP`
                : `${lifetime.toLocaleString()} SP`}
            </span>
          </div>
          <Progress
            value={animate ? tierPct : 0}
            className="h-2 transition-all duration-1000 ease-out"
          />
        </div>

      </div>
    </Card>
  );
}
