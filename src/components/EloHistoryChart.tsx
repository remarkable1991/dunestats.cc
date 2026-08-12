import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts";
import { TrendingUp } from "lucide-react";

type SystemKey = "overall" | "base" | "ix" | "uprising" | "vp";

const SYSTEMS: Array<{ k: SystemKey; label: string }> = [
  { k: "overall", label: "Overall" },
  { k: "base", label: "Base" },
  { k: "ix", label: "Rise of Ix" },
  { k: "uprising", label: "Uprising" },
  { k: "vp", label: "Overall VP (Sandbox)" },
];

const TIMEFRAMES: Array<{ k: string; label: string; days: number | null }> = [
  { k: "1d", label: "1 Day", days: 1 },
  { k: "7d", label: "7 Days", days: 7 },
  { k: "30d", label: "30 Days", days: 30 },
  { k: "90d", label: "90 Days", days: 90 },
  { k: "all", label: "All Time", days: null },
];

const COUNTS: Array<{ k: string; label: string; n: number | null }> = [
  { k: "10", label: "Last 10", n: 10 },
  { k: "25", label: "Last 25", n: 25 },
  { k: "50", label: "Last 50", n: 50 },
  { k: "100", label: "Last 100", n: 100 },
  { k: "allg", label: "All Games", n: null },
];

type Participant = {
  placement: number;
  player_name: string;
  leader_name: string | null;
  points: number;
  elo_delta: number | null;
  elo_delta_overall: number | null;
};

type Game = {
  id: string;
  public_match_id: string | null;
  created_at: string;
  game_version: "base" | "ix" | "uprising";
  board_version: string | null;
  has_rise_of_ix: boolean | null;
  has_epic_mode: boolean | null;
  has_immortality: boolean | null;
  has_base_leaders: boolean | null;
  results: Participant[];
};

type Point = {
  x: number;
  label: string;
  rating: number;
  delta: number;
  game: Game;
};

const BASELINE = 1000;

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs transition ${
        active ? "bg-sand text-sand-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

export function EloHistoryChart({ playerKey }: { playerKey: string }) {
  const [games, setGames] = useState<Game[]>([]);
  const [vpDeltas, setVpDeltas] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [system, setSystem] = useState<SystemKey>("overall");
  const [mode, setMode] = useState<"time" | "count">("time");
  const [timeframe, setTimeframe] = useState("30d");
  const [count, setCount] = useState("25");

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    (async () => {
      const { data: mine } = await supabase
        .from("game_results")
        .select("game_id")
        .ilike("player_name", playerKey)
        .limit(2000);
      const ids = Array.from(new Set(((mine ?? []) as { game_id: string }[]).map((r) => r.game_id)));
      if (!ids.length) {
        if (mounted) {
          setGames([]);
          setVpDeltas({});
          setLoading(false);
        }
        return;
      }
      const [{ data: gs }, { data: sb }] = await Promise.all([
        supabase
          .from("games")
          .select(
            "id, public_match_id, created_at, game_version, board_version, has_rise_of_ix, has_epic_mode, has_immortality, has_base_leaders, game_results(placement, player_name, leader_name, points, elo_delta, elo_delta_overall)",
          )
          .in("id", ids)
          .order("created_at", { ascending: true }),
        supabase
          .from("sandbox_game_results")
          .select("game_id, player_name, elo_delta_overall")
          .in("game_id", ids),
      ]);
      if (!mounted) return;
      const rows = ((gs ?? []) as unknown as Array<Game & { game_results: Participant[] }>).map((g) => ({
        ...g,
        results: g.game_results ?? [],
      }));
      const vmap: Record<string, number> = {};
      ((sb ?? []) as Array<{ game_id: string; player_name: string; elo_delta_overall: number | null }>).forEach((r) => {
        if (!r.game_id || !r.player_name || r.elo_delta_overall == null) return;
        vmap[`${r.game_id}::${r.player_name.toLowerCase().trim()}`] = Number(r.elo_delta_overall);
      });
      setGames(rows);
      setVpDeltas(vmap);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [playerKey]);

  const series = useMemo<Point[]>(() => {
    const relevant = games.filter((g) => {
      if (system === "base" || system === "ix" || system === "uprising") return g.game_version === system;
      return true;
    });
    let rating = BASELINE;
    const pts: Point[] = [];
    for (const g of relevant) {
      const me = g.results.find((r) => r.player_name.toLowerCase().trim() === playerKey);
      if (!me) continue;
      let delta: number | null = null;
      if (system === "overall") delta = me.elo_delta_overall;
      else if (system === "vp") delta = vpDeltas[`${g.id}::${playerKey}`] ?? null;
      else delta = me.elo_delta;
      if (delta == null) continue;
      rating += Number(delta);
      pts.push({
        x: new Date(g.created_at).getTime(),
        label: fmtDate(g.created_at),
        rating: Math.round(rating * 10) / 10,
        delta: Number(delta),
        game: g,
      });
    }
    return pts;
  }, [games, system, vpDeltas, playerKey]);

  const windowed = useMemo(() => {
    if (mode === "count") {
      const n = COUNTS.find((c) => c.k === count)?.n ?? null;
      return n ? series.slice(-n) : series;
    }
    const days = TIMEFRAMES.find((t) => t.k === timeframe)?.days ?? null;
    if (!days) return series;
    const cutoff = Date.now() - days * 86400000;
    return series.filter((p) => p.x >= cutoff);
  }, [series, mode, timeframe, count]);

  const chartData = useMemo(
    () => windowed.map((p, i) => ({ ...p, idx: i })),
    [windowed],
  );

  const start = windowed[0];
  const latest = windowed[windowed.length - 1];
  const change = start && latest ? latest.rating - (start.rating - start.delta) : 0;
  const windowLabel =
    mode === "count"
      ? COUNTS.find((c) => c.k === count)?.label
      : TIMEFRAMES.find((t) => t.k === timeframe)?.label;
  const systemLabel = SYSTEMS.find((s) => s.k === system)?.label ?? "";

  return (
    <section id="elo-history" className="mb-8 scroll-mt-24">
      <h2 className="font-display text-xl mb-3 flex items-center gap-2">
        <TrendingUp className="size-5 text-sand" /> ELO History
      </h2>

      <div className="grid sm:grid-cols-3 gap-3 mb-3">
        <Card className="p-4 border-border/60 bg-card/70">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Start</div>
          <div className="font-display text-3xl text-sand mt-1 tabular-nums">
            {start ? Math.round(start.rating - start.delta) : "—"}
          </div>
          <div className="text-xs text-muted-foreground mt-1">{start ? start.label : "No data"}</div>
        </Card>
        <Card className="p-4 border-border/60 bg-card/70">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Latest</div>
          <div className="font-display text-3xl text-sand mt-1 tabular-nums">
            {latest ? Math.round(latest.rating) : "—"}
          </div>
          <div className="text-xs text-muted-foreground mt-1">{latest ? latest.label : "No data"}</div>
        </Card>
        <Card className="p-4 border-border/60 bg-card/70">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Change</div>
          <div
            className={`font-display text-3xl mt-1 tabular-nums ${
              change > 0 ? "text-emerald-400" : change < 0 ? "text-red-400" : "text-muted-foreground"
            }`}
          >
            {latest ? `${change > 0 ? "+" : ""}${Math.round(change)}` : "—"}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {systemLabel} · {windowLabel}
          </div>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="inline-flex flex-wrap rounded-full border border-border/60 bg-card/60 p-0.5">
          {SYSTEMS.map((s) => (
            <Pill key={s.k} active={system === s.k} onClick={() => setSystem(s.k)}>
              {s.label}
            </Pill>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="inline-flex rounded-full border border-border/60 bg-card/60 p-0.5">
          {TIMEFRAMES.map((t) => (
            <Pill
              key={t.k}
              active={mode === "time" && timeframe === t.k}
              onClick={() => {
                setMode("time");
                setTimeframe(t.k);
              }}
            >
              {t.label}
            </Pill>
          ))}
        </div>
        <div className="inline-flex rounded-full border border-border/60 bg-card/60 p-0.5">
          {COUNTS.map((c) => (
            <Pill
              key={c.k}
              active={mode === "count" && count === c.k}
              onClick={() => {
                setMode("count");
                setCount(c.k);
              }}
            >
              {c.label}
            </Pill>
          ))}
        </div>
      </div>

      <Card className="p-4 border-border/60 bg-card/70">
        {loading ? (
          <p className="text-muted-foreground text-sm py-10 text-center">Loading rating history…</p>
        ) : chartData.length === 0 ? (
          <p className="text-muted-foreground text-sm py-10 text-center">No rated games in this window.</p>
        ) : (
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 12, bottom: 4, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis
                  dataKey={mode === "count" ? "idx" : "label"}
                  tickFormatter={(v) =>
                    mode === "count" ? `#${Number(v) + 1}` : String(v)
                  }
                  tick={{ fontSize: 11 }}
                  stroke="currentColor"
                  className="text-muted-foreground"
                  minTickGap={20}
                />
                <YAxis
                  domain={["dataMin - 25", "dataMax + 25"]}
                  tick={{ fontSize: 11 }}
                  stroke="currentColor"
                  className="text-muted-foreground"
                  width={52}
                />
                <Tooltip
                  cursor={{ stroke: "var(--border)" }}
                  wrapperStyle={{ outline: "none", zIndex: 50 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as Point;
                    return <MatchTooltip point={p} playerKey={playerKey} system={system} />;
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="rating"
                  stroke="var(--sand)"
                  strokeWidth={2}
                  dot={{ r: 2, fill: "var(--sand)" }}
                  activeDot={{ r: 5, fill: "var(--sand)" }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </section>
  );
}

function MatchTooltip({
  point,
  playerKey,
  system,
}: {
  point: Point;
  playerKey: string;
  system: SystemKey;
}) {
  const g = point.game;
  const tags: string[] = [];
  if (g.board_version) tags.push(g.board_version === "uprising" ? "Uprising" : "Base");
  if (g.has_rise_of_ix) tags.push("Rise of Ix");
  if (g.has_epic_mode) tags.push("Epic");
  if (g.has_immortality) tags.push("Immortality");
  if (g.has_base_leaders) tags.push("Base Leaders");
  const sorted = [...g.results].sort((a, b) => a.placement - b.placement);
  const deltaLabel = `${point.delta > 0 ? "+" : ""}${Math.round(point.delta * 10) / 10}`;

  return (
    <div className="w-[320px] rounded-lg border border-border/60 bg-card p-3 shadow-xl">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-xs text-muted-foreground">{new Date(g.created_at).toLocaleString()}</span>
        <Link
          to="/match/$matchId"
          params={{ matchId: g.public_match_id ?? g.id }}
          className="text-[11px] px-1.5 py-0.5 rounded border border-border/60 text-sand font-mono"
        >
          #{g.public_match_id ?? g.id.slice(0, 8)}
        </Link>
      </div>
      <div className="flex flex-wrap gap-1 mb-2">
        {tags.map((t) => (
          <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary/60 text-secondary-foreground">
            {t}
          </span>
        ))}
      </div>
      <div className="grid gap-1">
        {sorted.map((r, i) => {
          const isMe = r.player_name.toLowerCase().trim() === playerKey;
          return (
            <div
              key={i}
              className={`flex items-center justify-between gap-2 rounded px-2 py-1 text-xs ${
                isMe ? "bg-sand/15 border border-sand/40 font-semibold" : "bg-background/40"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="inline-flex size-4 items-center justify-center rounded bg-secondary/60 text-[10px] font-bold">
                  {r.placement}
                </span>
                <span className="truncate">
                  {r.player_name}
                  <span className="text-muted-foreground font-normal"> · {r.leader_name ?? "—"}</span>
                </span>
              </div>
              <span className="tabular-nums flex items-center gap-1 shrink-0">
                <span className="text-sand font-display">{r.points}</span>
                {isMe && (
                  <span className={point.delta > 0 ? "text-emerald-400" : point.delta < 0 ? "text-red-400" : "text-muted-foreground"}>
                    ({deltaLabel})
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <div className="text-[10px] text-muted-foreground mt-2">
        {SYSTEMS.find((s) => s.k === system)?.label} rating after match: {Math.round(point.rating)}
      </div>
    </div>
  );
}
