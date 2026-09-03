import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Sparkles, Users as UsersIcon, Copy, Clock, Check } from "lucide-react";
import { toast } from "sonner";
import { discordEpoch, parseSuggestedSlots } from "@/lib/match-schedules";

export type HeatmapPlayer = {
  player_name: string;
  discord_username: string | null;
  player_compatibility_score: number | null;
  player_availability: string[] | null; // ISO timestamps
};

/** Round a Date down to the local half hour. */
function halfHourFloor(d: Date) {
  const x = new Date(d);
  x.setSeconds(0, 0);
  x.setMinutes(x.getMinutes() < 30 ? 0 : 30);
  return x;
}

const HOURS = Array.from({ length: 48 }, (_, i) => i); // 0..47 half hours
const HALF_HOUR = 30 * 60 * 1000;

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

const localFmt = (d: Date) =>
  d.toLocaleString(undefined, { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

function copyDiscord(epochSec: number) {
  const code = `<t:${epochSec}:F>`;
  void navigator.clipboard
    .writeText(code)
    .then(() => toast.success(`Copied ${code}`))
    .catch(() => toast.error("Could not copy to clipboard"));
}

export type HeatmapBodyProps = {
  tableId: string;
  matchQuality: number | null;
  players: HeatmapPlayer[];
  suggestedSlots?: unknown;
  myPlayerName?: string | null;
  /** "live" tournaments show suggested alternative 2h slots; "async" hides them. */
  playMode?: "live" | "async";
  /** When set, shows a link to that tournament's registration form. */
  registerTournamentNum?: number | null;
};

export function AvailabilityHeatmap({
  open,
  onOpenChange,
  ...body
}: HeatmapBodyProps & { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <UsersIcon className="size-5 text-sand" /> {body.tableId} — Availability Map
            {body.matchQuality != null && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-sand/40 bg-sand/15 px-2 py-0.5 text-xs text-sand">
                📅 Availability Map (Score: {fmtScore(body.matchQuality)})
              </span>
            )}

          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            30-minute slots in your local timezone. Click any time to copy its Discord timestamp code.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-auto">
          <HeatmapBody {...body} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function HeatmapBody({
  players,
  suggestedSlots,
  myPlayerName,
  playMode = "async",
  registerTournamentNum = null,
}: HeatmapBodyProps) {
  const [futureOnly, setFutureOnly] = useState(true);
  const playerNamesKey = useMemo(() => players.map((p) => p.player_name).join("\u0001"), [players]);
  const allNames = useMemo(() => players.map((p) => p.player_name), [players]);
  // Default: everyone selected. Clicking a player toggles them in/out of the filter.
  const [selected, setSelected] = useState<string[]>(allNames);
  useEffect(() => {
    setSelected(players.map((p) => p.player_name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerNamesKey]);
  const togglePlayer = (name: string) =>
    setSelected((prev) => {
      const all = players.map((p) => p.player_name);
      // When everyone is selected, clicking a player solo-selects them (1/4)
      // instead of dropping them from the roster (which would show 3/4).
      if (prev.length === all.length && prev.includes(name)) {
        return [name];
      }
      // Clicking the only selected player reselects everyone.
      if (prev.length === 1 && prev[0] === name) {
        return all;
      }
      return prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name];
    });
  const { dayList, slotPlayers } = useMemo(() => {
    // epoch ms -> Set of player names present at that local half-hour
    const present = new Map<number, Set<string>>();
    for (const p of players) {
      const av = p.player_availability ?? [];
      const seen = new Set<number>();
      for (const iso of av) {
        const d = halfHourFloor(new Date(iso));
        const k = d.getTime();
        if (seen.has(k)) continue;
        seen.add(k);
        if (!present.has(k)) present.set(k, new Set());
        present.get(k)!.add(p.player_name);
      }
    }
    const times = [...present.keys()];
    if (times.length === 0) {
      return {
        dayList: [] as Date[],
        slotMatrix: new Map<string, number>(),
        slotPlayers: new Map<string, string[]>(),
      };
    }
    times.sort((a, b) => a - b);
    const first = new Date(times[0]);
    first.setHours(0, 0, 0, 0);
    const lastDay = new Date(times[times.length - 1]);
    lastDay.setHours(0, 0, 0, 0);
    // Only render days that actually contain availability (drop trailing blank days)
    const span = Math.min(
      28,
      Math.floor((lastDay.getTime() - first.getTime()) / (24 * 3600 * 1000)) + 1,
    );

    const dayList: Date[] = [];
    for (let i = 0; i < span; i++) {
      const d = new Date(first);
      d.setDate(first.getDate() + i);
      dayList.push(d);
    }
    const slotMatrix = new Map<string, number>();
    const slotPlayers = new Map<string, string[]>();
    for (const [k, set] of present) {
      const d = new Date(k);
      const dayIdx = Math.floor((d.getTime() - dayList[0].getTime()) / (24 * 3600 * 1000));
      if (dayIdx < 0 || dayIdx >= span) continue;
      const halfHourIdx = d.getHours() * 2 + (d.getMinutes() >= 30 ? 1 : 0);
      const key = `${dayIdx}:${halfHourIdx}`;
      slotMatrix.set(key, set.size);
      slotPlayers.set(key, [...set]);
    }
    return { dayList, slotMatrix, slotPlayers };
  }, [players]);

  const playerNames = useMemo(() => players.map((p) => p.player_name), [players]);

  const suggestions = useMemo(() => parseSuggestedSlots(suggestedSlots), [suggestedSlots]);

  /** Epoch (ms) of every already-suggested slot, so alternatives stay distinct. */
  const suggestedStarts = useMemo(() => {
    const s = new Set<number>();
    for (const sug of suggestions) {
      const e = discordEpoch(sug.time_text);
      if (e != null) s.add(halfHourFloor(new Date(e * 1000)).getTime());
    }
    return s;
  }, [suggestions]);

  /** 2h windows where everybody (or everybody but you) is free. */
  const windows = useMemo(() => {
    const perSlot = new Map<number, Set<string>>();
    for (const p of players) {
      for (const iso of p.player_availability ?? []) {
        const k = halfHourFloor(new Date(iso)).getTime();
        if (!perSlot.has(k)) perSlot.set(k, new Set());
        perSlot.get(k)!.add(p.player_name);
      }
    }
    const total = players.length;
    const me = myPlayerName ?? null;
    const starts = [...perSlot.keys()].sort((a, b) => a - b);
    const all: { start: number; kind: "all" | "others" }[] = [];
    for (const s of starts) {
      const sets = [0, 1, 2, 3].map((i) => perSlot.get(s + i * HALF_HOUR));
      if (sets.some((x) => !x)) continue;
      const common = players
        .map((p) => p.player_name)
        .filter((n) => sets.every((set) => set!.has(n)));
      if (common.length === total && total > 0) all.push({ start: s, kind: "all" });
      else if (me && common.length === total - 1 && !common.includes(me)) all.push({ start: s, kind: "others" });
    }
    // Greedy de-overlap so the list stays readable, and never repeat a
    // window that overlaps one of the suggested slots above.
    const out: { start: number; kind: "all" | "others" }[] = [];
    let lastEnd = -Infinity;
    for (const w of all) {
      if (w.start < lastEnd) continue;
      const clashes = [...suggestedStarts].some(
        (s) => Math.abs(s - w.start) < 4 * HALF_HOUR,
      );
      if (clashes) continue;
      out.push(w);
      lastEnd = w.start + 4 * HALF_HOUR;
    }
    return out.slice(0, 12);
  }, [players, myPlayerName, suggestedStarts]);

  const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "2-digit" });
  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });

  return (
    <div className="space-y-4">
      {(suggestions.length > 0 || (playMode === "live" && windows.length > 0)) && (
        <Card className="p-4 border-border/60 bg-card/70 space-y-4">
          {suggestions.length > 0 && (
            <div>
              <h3 className="font-display text-sm text-sand mb-2 flex items-center gap-2">
                <Clock className="size-4" /> Suggested slots
              </h3>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s, i) => {
                  const e = discordEpoch(s.time_text);
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={e == null}
                      onClick={() => e != null && copyDiscord(e)}
                      className="inline-flex items-center gap-2 rounded-md border border-sand/40 bg-sand/10 px-3 py-1.5 text-xs hover:bg-sand/20 transition disabled:opacity-50"
                    >
                      <span className="font-display text-sand">{s.label || String.fromCharCode(65 + i)}</span>
                      <span className="tabular-nums">{e != null ? localFmt(new Date(e * 1000)) : s.time_text}</span>
                      <Copy className="size-3 opacity-60" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {playMode === "live" && windows.length > 0 && (
            <div>
              <h3 className="font-display text-sm text-sand mb-2 flex items-center gap-2">
                <Sparkles className="size-4" /> Other 2-hour options
              </h3>
              <div className="flex flex-wrap gap-2">
                {windows.map((w) => {
                  const epoch = Math.floor(w.start / 1000);
                  const isAll = w.kind === "all";
                  return (
                    <button
                      key={w.start}
                      type="button"
                      onClick={() => copyDiscord(epoch)}
                      className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition ${
                        isAll
                          ? "border-emerald-400/50 bg-emerald-500/10 hover:bg-emerald-500/20"
                          : "border-border/60 bg-background/40 hover:bg-background/70"
                      }`}
                      title={isAll ? "Everyone is free for 2 hours" : "Everyone but you is free for 2 hours"}
                    >
                      <span className="tabular-nums">{localFmt(new Date(w.start))}</span>
                      <span className="text-[10px] text-muted-foreground">{isAll ? "all free" : "all but you"}</span>
                      <Copy className="size-3 opacity-60" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setFutureOnly((v) => !v)}
          className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition ${
            futureOnly ? "border-sand/50 bg-sand/15 text-sand" : "border-border/60 bg-background/40 text-muted-foreground hover:bg-background/70"
          }`}
        >
          <Check className={`size-3 ${futureOnly ? "opacity-100" : "opacity-30"}`} />
          Only today &amp; future
        </button>
        {registerTournamentNum != null && (
          <a
            href={`/tournament-register/${registerTournamentNum}`}
            className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-3 py-1.5 text-xs hover:bg-background/70 transition"
          >
            <Clock className="size-3 opacity-70" /> Update my availability
          </a>
        )}
      </div>

      {visibleDays.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          {dayList.length === 0
            ? "No availability recorded for this table."
            : "No availability from today onwards — turn off the filter to see past dates."}
        </p>
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
            {visibleDays.map(({ d, di }) => (
              <div key={di} className="grid" style={{ gridTemplateColumns: `120px repeat(48, minmax(14px, 1fr))` }}>
                <div className="sticky left-0 bg-background z-10 pr-2 py-0.5 text-xs text-muted-foreground border-r border-border/30">
                  {dayFmt.format(d)}
                </div>
                {HOURS.map((h) => {
                  const key = `${di}:${h}`;
                  const slotStart = new Date(d);
                  slotStart.setHours(Math.floor(h / 2), (h % 2) * 30, 0, 0);
                  const presentAll = slotPlayers.get(key) ?? [];
                  const present = presentAll.filter((n) => selected.includes(n));
                  const c = present.length;
                  const total = selected.length;
                  const missing = selected.filter((n) => !present.includes(n));
                  // Scale density to the number of selected players (0..4 buckets)
                  const intensity = total === 0 ? 0 : Math.round((c / total) * 4);
                  return (
                    <button
                      key={h}
                      type="button"
                      onClick={() => copyDiscord(Math.floor(slotStart.getTime() / 1000))}
                      title={`${dayFmt.format(d)} · ${timeFmt.format(slotStart)} — ${c}/${total} free${missing.length ? ` (missing ${missing.join(", ")})` : ""}`}
                      className={`h-4 border-r border-b transition-colors ${densityClass(intensity)}`}
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
        <p className="text-[11px] text-muted-foreground mb-2">
          Click a player to filter the map to their availability — click multiple to stack them.
        </p>
        <ul className="grid sm:grid-cols-2 gap-2 text-sm">
          {players.map((p) => {
            const active = selected.includes(p.player_name);
            return (
              <li key={p.player_name}>
                <button
                  type="button"
                  onClick={() => togglePlayer(p.player_name)}
                  aria-pressed={active}
                  className={`w-full flex items-center justify-between gap-2 border rounded-md px-3 py-2 transition text-left ${
                    active
                      ? "border-sand/60 bg-sand/10"
                      : "border-border/40 bg-background/40 opacity-50 hover:opacity-80"
                  }`}
                >
                  <div className="min-w-0 flex items-center gap-2">
                    <span
                      className={`shrink-0 inline-flex items-center justify-center size-4 rounded-full border ${
                        active ? "bg-sand text-background border-sand" : "border-border/60 text-transparent"
                      }`}
                    >
                      <Check className="size-3" />
                    </span>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{p.player_name}</div>
                      {p.discord_username && <div className="text-[10px] text-muted-foreground truncate">@{p.discord_username}</div>}
                    </div>
                  </div>
                  <span className="font-mono text-sand">{fmtScore(p.player_compatibility_score)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
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
