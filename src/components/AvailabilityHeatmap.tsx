import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Sparkles, Users as UsersIcon } from "lucide-react";

export type HeatmapPlayer = {
  player_name: string;
  discord_username: string | null;
  player_compatibility_score: number | null;
  player_availability: string[] | null; // ISO timestamps
};

type Slot = { key: string; date: Date; count: number };

/** Round a Date down to the local half hour. */
function halfHourFloor(d: Date) {
  const x = new Date(d);
  x.setSeconds(0, 0);
  x.setMinutes(x.getMinutes() < 30 ? 0 : 30);
  return x;
}

const HOURS = Array.from({ length: 48 }, (_, i) => i); // 0..47 half hours

function densityClass(count: number): string {
  switch (count) {
    case 0: return "bg-background/40 border-border/30";
    case 1: return "bg-sand/10 border-sand/20";
    case 2: return "bg-sand/25 border-sand/30";
    case 3: return "bg-amber-500/60 border-amber-400/70";
    default: return "bg-sand text-background border-sand shadow-[0_0_10px_rgba(212,175,55,0.6)]";
  }
}

function densityLabel(count: number): string {
  switch (count) {
    case 0: return "0 free";
    case 1: return "1 free";
    case 2: return "2 free";
    case 3: return "3 free";
    default: return "🔥 4/4";
  }
}

/** Format a score, keeping one decimal when it isn't a whole number. */
function fmtScore(n: number | string | null | undefined): string {
  if (n == null) return "\u2014";
  const v = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(v)) return String(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export function AvailabilityHeatmap({
  open,
  onOpenChange,
  tableId,
  matchQuality,
  players,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tableId: string;
  matchQuality: number | null;
  players: HeatmapPlayer[];
}) {
  const { dayList, slotMatrix } = useMemo(() => {
    // Aggregate counts per local half-hour slot
    const counts = new Map<number, number>(); // key: epoch ms of local half-hour
    for (const p of players) {
      const av = p.player_availability ?? [];
      const seen = new Set<number>();
      for (const iso of av) {
        const d = halfHourFloor(new Date(iso));
        const k = d.getTime();
        if (seen.has(k)) continue;
        seen.add(k);
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    }
    // Determine window: from earliest local day to +28 days
    const times = [...counts.keys()];
    if (times.length === 0) {
      return { dayList: [] as Date[], slotMatrix: new Map<string, number>() };
    }
    times.sort((a, b) => a - b);
    const first = new Date(times[0]);
    first.setHours(0, 0, 0, 0);

    const dayList: Date[] = [];
    for (let i = 0; i < 28; i++) {
      const d = new Date(first);
      d.setDate(first.getDate() + i);
      dayList.push(d);
    }
    const slotMatrix = new Map<string, number>();
    for (const [k, c] of counts) {
      const d = new Date(k);
      const dayIdx = Math.floor((d.getTime() - dayList[0].getTime()) / (24 * 3600 * 1000));
      if (dayIdx < 0 || dayIdx >= 28) continue;
      const halfHourIdx = d.getHours() * 2 + (d.getMinutes() >= 30 ? 1 : 0);
      slotMatrix.set(`${dayIdx}:${halfHourIdx}`, c);
    }
    return { dayList, slotMatrix };
  }, [players]);

  const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "2-digit" });
  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <UsersIcon className="size-5 text-sand" /> {tableId} — Availability Map
            {matchQuality != null && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-sand/40 bg-sand/15 px-2 py-0.5 text-xs text-sand">
                <Sparkles className="size-3" /> Match Quality {fmtScore(matchQuality)}
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            30-minute slots across the 4-week tournament window in your local timezone.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4">
          {dayList.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No availability recorded for this table.</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="inline-block min-w-full">
                {/* Header row: hours */}
                <div className="grid" style={{ gridTemplateColumns: `120px repeat(48, minmax(14px, 1fr))` }}>
                  <div className="sticky left-0 bg-background z-10" />
                  {HOURS.map((h) => (
                    <div key={h} className="text-[9px] text-muted-foreground text-center border-b border-border/20 tabular-nums">
                      {h % 2 === 0 ? `${(h / 2).toString().padStart(2, "0")}` : ""}
                    </div>
                  ))}
                </div>
                {dayList.map((d, di) => (
                  <div key={di} className="grid" style={{ gridTemplateColumns: `120px repeat(48, minmax(14px, 1fr))` }}>
                    <div className="sticky left-0 bg-background z-10 pr-2 py-0.5 text-xs text-muted-foreground border-r border-border/30">
                      {dayFmt.format(d)}
                    </div>
                    {HOURS.map((h) => {
                      const c = slotMatrix.get(`${di}:${h}`) ?? 0;
                      const slotStart = new Date(d);
                      slotStart.setHours(Math.floor(h / 2), (h % 2) * 30, 0, 0);
                      return (
                        <div
                          key={h}
                          title={`${dayFmt.format(d)} · ${timeFmt.format(slotStart)} — ${densityLabel(c)}`}
                          className={`h-4 border-r border-b transition-colors ${densityClass(c)}`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
              <Legend />
            </div>
          )}

          <Card className="p-4 border-border/60 bg-card/70">
            <h3 className="font-display text-sm text-sand mb-2 flex items-center gap-2">
              <Sparkles className="size-4" /> Players &amp; Compatibility
            </h3>
            <ul className="grid sm:grid-cols-2 gap-2 text-sm">
              {players.map((p) => (
                <li key={p.player_name} className="flex items-center justify-between border border-border/40 rounded-md px-3 py-2 bg-background/40">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{p.player_name}</div>
                    {p.discord_username && <div className="text-[10px] text-muted-foreground truncate">@{p.discord_username}</div>}
                  </div>
                  <span className="font-mono text-sand">{fmtScore(p.player_compatibility_score)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Legend() {
  const entries: { c: number; label: string }[] = [
    { c: 0, label: "0" }, { c: 1, label: "1" }, { c: 2, label: "2" }, { c: 3, label: "3" }, { c: 4, label: "4 / 4" },
  ];
  return (
    <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
      <span>Players free:</span>
      {entries.map((e) => (
        <span key={e.c} className="inline-flex items-center gap-1">
          <span className={`inline-block h-3 w-4 border ${densityClass(e.c)}`} />
          {e.label}
        </span>
      ))}
    </div>
  );
}
