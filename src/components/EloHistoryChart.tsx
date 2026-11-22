import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingUp } from "lucide-react";
import {
  rankHistorySummary,
  visibleLeagueFormatChanges,
  withRatingBaseline,
  type LeagueFormatPreset,
  type RatingBaselinePoint,
} from "@/lib/elo-history";

type SystemKey = "overall" | "base" | "ix" | "uprising" | "vp" | "league";
type ChartMetric = "rating" | "rank";

const SYSTEMS: Array<{ k: SystemKey; label: string }> = [
  { k: "overall", label: "Overall" },
  { k: "base", label: "Base" },
  { k: "ix", label: "Rise of Ix" },
  { k: "uprising", label: "Uprising" },
  { k: "vp", label: "Overall VP (Sandbox)" },
  { k: "league", label: "League" },
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
  kind: "game";
  x: number;
  label: string;
  rating: number;
  delta: number;
  game: Game;
  rankBefore: number | null;
  rankAfter: number | null;
};

type ChartPoint = (Point | RatingBaselinePoint) & { idx: number };
type LeagueDelta = {
  game_id: string;
  season: number;
  elo_delta: number;
  rank_before: number | null;
  rank_after: number | null;
};

const BASELINE = 1000;

function fmtDate(value: string | number) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
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

export function EloHistoryChart({ playerKey, leagueOnly = false, leagueSeason = null }: { playerKey: string; leagueOnly?: boolean; leagueSeason?: number | null }) {
  const [games, setGames] = useState<Game[]>([]);
  const [vpDeltas, setVpDeltas] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [system, setSystem] = useState<SystemKey>("overall");
  const [metric, setMetric] = useState<ChartMetric>("rating");
  const [mode, setMode] = useState<"time" | "count">("time");
  const [timeframe, setTimeframe] = useState("30d");
  const [count, setCount] = useState("25");
  const [leagueDeltas, setLeagueDeltas] = useState<LeagueDelta[]>([]);
  const [leaguePresets, setLeaguePresets] = useState<LeagueFormatPreset[]>([]);

  useEffect(() => {
    if (leagueOnly) setSystem("league");
    else setSystem((current) => (current === "league" ? "overall" : current));
  }, [leagueOnly]);

  useEffect(() => {
    if (system !== "league") setMetric("rating");
  }, [system]);

  useEffect(() => {
    let mounted = true;
    void Promise.all([
      supabase
        .from("league_match_rating_deltas")
        .select("game_id, season, elo_delta, rank_before, rank_after")
        .eq("player_key", playerKey)
        .limit(2000),
      supabase
        .from("league_presets")
        .select("id, name, start_date, expansions")
        .order("start_date", { ascending: true }),
    ]).then(([deltas, presets]) => {
      if (!mounted) return;
      setLeagueDeltas((deltas.data ?? []) as LeagueDelta[]);
      setLeaguePresets((presets.data ?? []) as LeagueFormatPreset[]);
    });
    return () => {
      mounted = false;
    };
  }, [playerKey]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    (async () => {
      const { data: mine } = await supabase
        .from("game_results")
        .select("game_id")
        .ilike("player_name", playerKey)
        .limit(2000);
      const ids = Array.from(new Set(((mine ?? []) as { game_id: string }[]).map((row) => row.game_id)));
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
      const rows = ((gs ?? []) as unknown as Array<Game & { game_results: Participant[] }>).map((game) => ({
        ...game,
        results: game.game_results ?? [],
      }));
      const vmap: Record<string, number> = {};
      ((sb ?? []) as Array<{ game_id: string; player_name: string; elo_delta_overall: number | null }>).forEach((row) => {
        if (!row.game_id || !row.player_name || row.elo_delta_overall == null) return;
        vmap[`${row.game_id}::${row.player_name.toLowerCase().trim()}`] = Number(row.elo_delta_overall);
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
    const relevant = games.filter((game) => {
      if (system === "base" || system === "ix" || system === "uprising") return game.game_version === system;
      return true;
    });
    const leagueMap = new Map<string, LeagueDelta>();
    for (const delta of leagueDeltas) {
      if (leagueSeason != null && delta.season !== leagueSeason) continue;
      leagueMap.set(delta.game_id, delta);
    }
    let rating = BASELINE;
    const points: Point[] = [];
    for (const game of relevant) {
      const me = game.results.find((result) => result.player_name.toLowerCase().trim() === playerKey);
      if (!me) continue;
      let delta: number | null = null;
      const league = leagueMap.get(game.id);
      if (system === "overall") delta = me.elo_delta_overall;
      else if (system === "vp") delta = vpDeltas[`${game.id}::${playerKey}`] ?? null;
      else if (system === "league") delta = league ? Number(league.elo_delta) : null;
      else delta = me.elo_delta;
      if (delta == null) continue;
      rating += Number(delta);
      points.push({
        kind: "game",
        x: new Date(game.created_at).getTime(),
        label: fmtDate(game.created_at),
        rating: Math.round(rating * 10) / 10,
        delta: Number(delta),
        game,
        rankBefore: system === "league" ? league?.rank_before ?? null : null,
        rankAfter: system === "league" ? league?.rank_after ?? null : null,
      });
    }
    return points;
  }, [games, system, vpDeltas, playerKey, leagueDeltas, leagueSeason]);

  const windowed = useMemo(() => {
    if (mode === "count") {
      const n = COUNTS.find((item) => item.k === count)?.n ?? null;
      return n ? series.slice(-n) : series;
    }
    const days = TIMEFRAMES.find((item) => item.k === timeframe)?.days ?? null;
    if (!days) return series;
    const cutoff = Date.now() - days * 86400000;
    return series.filter((point) => point.x >= cutoff);
  }, [series, mode, timeframe, count]);

  const chartData = useMemo<ChartPoint[]>(() => {
    const points = metric === "rank"
      ? windowed.filter((point) => point.rankAfter != null)
      : withRatingBaseline(windowed);
    return points.map((point, idx) => ({ ...point, idx }));
  }, [windowed, metric]);

  const start = windowed[0];
  const latest = windowed[windowed.length - 1];
  const startRating = start ? Math.round((start.rating - start.delta) * 10) / 10 : null;
  const change = start && latest && startRating != null ? latest.rating - startRating : 0;
  const ranks = useMemo(() => rankHistorySummary(windowed), [windowed]);
  const firstRanked = windowed.find((point) => point.rankAfter != null);
  const windowLabel = mode === "count"
    ? COUNTS.find((item) => item.k === count)?.label
    : TIMEFRAMES.find((item) => item.k === timeframe)?.label;
  const systemLabel = SYSTEMS.find((item) => item.k === system)?.label ?? "";

  const formatLines = useMemo(() => {
    if (system !== "league" || !start || !latest) return [];
    return visibleLeagueFormatChanges(leaguePresets, start.x - 1, latest.x, Date.now()).flatMap((marker) => {
      const firstGameAfter = chartData.find((point) => point.kind === "game" && point.x >= marker.x);
      const anchor = firstGameAfter ?? [...chartData].reverse().find((point) => point.kind === "game");
      if (!anchor) return [];
      return [{ ...marker, axisX: mode === "count" ? anchor.idx : marker.x > latest.x ? anchor.x : marker.x }];
    });
  }, [system, start, latest, leaguePresets, chartData, mode]);

  return (
    <section id="elo-history" className="mb-8 scroll-mt-24">
      <h2 className="font-display text-xl mb-3 flex items-center gap-2">
        <TrendingUp className="size-5 text-sand" /> ELO History
      </h2>

      {metric === "rank" && system === "league" ? (
        <div className="grid sm:grid-cols-3 gap-3 mb-3">
          <Card className="p-4 border-border/60 bg-card/70">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">First Rank</div>
            <div className="font-display text-3xl text-teal mt-1 tabular-nums">{ranks.first ? `#${ranks.first}` : "—"}</div>
            <div className="text-xs text-muted-foreground mt-1">{firstRanked ? `After ${firstRanked.label}` : "No rank data"}</div>
          </Card>
          <Card className="p-4 border-border/60 bg-card/70">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Peak Rank</div>
            <div className="font-display text-3xl text-teal mt-1 tabular-nums">{ranks.peak ? `#${ranks.peak}` : "—"}</div>
            <div className="text-xs text-muted-foreground mt-1">Best after-game rank</div>
          </Card>
          <Card className="p-4 border-border/60 bg-card/70">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Current Rank</div>
            <div className="font-display text-3xl text-teal mt-1 tabular-nums">{ranks.latest ? `#${ranks.latest}` : "—"}</div>
            <div className="text-xs text-muted-foreground mt-1">League · {windowLabel}</div>
          </Card>
        </div>
      ) : (
        <div className="grid sm:grid-cols-3 gap-3 mb-3">
          <Card className="p-4 border-border/60 bg-card/70">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Start</div>
            <div className="font-display text-3xl text-sand mt-1 tabular-nums">{startRating != null ? Math.round(startRating) : "—"}</div>
            <div className="text-xs text-muted-foreground mt-1">{start ? `Before ${start.label}` : "No data"}</div>
          </Card>
          <Card className="p-4 border-border/60 bg-card/70">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Latest</div>
            <div className="font-display text-3xl text-sand mt-1 tabular-nums">{latest ? Math.round(latest.rating) : "—"}</div>
            <div className="text-xs text-muted-foreground mt-1">{latest ? latest.label : "No data"}</div>
          </Card>
          <Card className="p-4 border-border/60 bg-card/70">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Change</div>
            <div className={`font-display text-3xl mt-1 tabular-nums ${change > 0 ? "text-emerald-400" : change < 0 ? "text-red-400" : "text-muted-foreground"}`}>
              {latest ? `${change > 0 ? "+" : ""}${Math.round(change)}` : "—"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">{systemLabel} · {windowLabel}</div>
          </Card>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="inline-flex flex-wrap rounded-full border border-border/60 bg-card/60 p-0.5">
          {SYSTEMS.filter((item) => !leagueOnly || item.k === "league").map((item) => (
            <Pill key={item.k} active={system === item.k} onClick={() => setSystem(item.k)}>
              {item.label}
            </Pill>
          ))}
        </div>
        {system === "league" && (
          <div className="inline-flex rounded-full border border-border/60 bg-card/60 p-0.5" aria-label="League graph metric">
            <Pill active={metric === "rating"} onClick={() => setMetric("rating")}>Rating (ELO)</Pill>
            <Pill active={metric === "rank"} onClick={() => setMetric("rank")}>Rank after game</Pill>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="inline-flex rounded-full border border-border/60 bg-card/60 p-0.5">
          {TIMEFRAMES.map((item) => (
            <Pill
              key={item.k}
              active={mode === "time" && timeframe === item.k}
              onClick={() => {
                setMode("time");
                setTimeframe(item.k);
              }}
            >
              {item.label}
            </Pill>
          ))}
        </div>
        <div className="inline-flex rounded-full border border-border/60 bg-card/60 p-0.5">
          {COUNTS.map((item) => (
            <Pill
              key={item.k}
              active={mode === "count" && count === item.k}
              onClick={() => {
                setMode("count");
                setCount(item.k);
              }}
            >
              {item.label}
            </Pill>
          ))}
        </div>
      </div>

      <Card className="p-4 border-border/60 bg-card/70">
        {loading ? (
          <p className="text-muted-foreground text-sm py-10 text-center">Loading rating history…</p>
        ) : chartData.length === 0 ? (
          <p className="text-muted-foreground text-sm py-10 text-center">
            {metric === "rank" ? "No recorded League ranks in this window." : "No rated games in this window."}
          </p>
        ) : (
          <>
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 28, right: 16, bottom: 4, left: -12 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                  <XAxis
                    dataKey={mode === "count" ? "idx" : "x"}
                    type="number"
                    scale={mode === "count" ? "linear" : "time"}
                    domain={mode === "count" ? [0, Math.max(1, chartData.length - 1)] : ["dataMin - 3600000", "dataMax + 3600000"]}
                    tickFormatter={(value) => {
                      if (mode === "time") return fmtDate(Number(value));
                      const index = Number(value);
                      if (metric === "rating") return index === 0 ? "Start" : `#${index}`;
                      return `#${index + 1}`;
                    }}
                    tick={{ fontSize: 11 }}
                    stroke="currentColor"
                    className="text-muted-foreground"
                    minTickGap={24}
                  />
                  <YAxis
                    domain={metric === "rank"
                      ? [(dataMin: number) => Math.max(1, Math.floor(dataMin - 1)), (dataMax: number) => Math.ceil(dataMax + 1)]
                      : ["dataMin - 25", "dataMax + 25"]}
                    reversed={metric === "rank"}
                    allowDecimals={false}
                    tickFormatter={(value) => metric === "rank" ? `#${value}` : String(value)}
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
                      const point = payload[0]?.payload as ChartPoint | undefined;
                      if (!point) return null;
                      if (point.kind === "baseline") return <BaselineTooltip point={point} />;
                      return <MatchTooltip point={point} playerKey={playerKey} system={system} metric={metric} />;
                    }}
                  />
                  {formatLines.map((marker) => (
                    <ReferenceLine
                      key={marker.id}
                      x={marker.axisX}
                      stroke="var(--teal)"
                      strokeDasharray="4 4"
                      strokeOpacity={0.75}
                      label={{ value: marker.label, position: "insideTopRight", fill: "var(--teal)", fontSize: 10 }}
                    />
                  ))}
                  <Line
                    type="monotone"
                    dataKey={metric === "rank" ? "rankAfter" : "rating"}
                    stroke={metric === "rank" ? "var(--teal)" : "var(--sand)"}
                    strokeWidth={2}
                    dot={{ r: 2, fill: metric === "rank" ? "var(--teal)" : "var(--sand)" }}
                    activeDot={{ r: 5, fill: metric === "rank" ? "var(--teal)" : "var(--sand)" }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {metric === "rank" && (
              <p className="mt-2 text-xs text-muted-foreground">Rank is recorded after each of your games; rank #1 appears at the top.</p>
            )}
            {formatLines.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                {formatLines.map((marker) => (
                  <span key={marker.id}>
                    <span className="text-teal">{marker.label}</span>
                    {marker.expansions?.length ? ` · ${marker.expansions.join(" + ")}` : ""}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </Card>
    </section>
  );
}

function BaselineTooltip({ point }: { point: RatingBaselinePoint }) {
  return (
    <div className="w-[240px] rounded-lg border border-border/60 bg-card p-3 shadow-xl">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">Start</div>
      <div className="font-display text-2xl text-sand mt-1">{Math.round(point.rating)} ELO</div>
      <div className="text-xs text-muted-foreground mt-1">Rating before the first game in this view.</div>
    </div>
  );
}

function MatchTooltip({
  point,
  playerKey,
  system,
  metric,
}: {
  point: Point;
  playerKey: string;
  system: SystemKey;
  metric: ChartMetric;
}) {
  const game = point.game;
  const tags: string[] = [];
  if (game.board_version) tags.push(game.board_version === "uprising" ? "Uprising" : "Base");
  if (game.has_rise_of_ix) tags.push("Rise of Ix");
  if (game.has_epic_mode) tags.push("Epic");
  if (game.has_immortality) tags.push("Immortality");
  if (game.has_base_leaders) tags.push("Base Leaders");
  const sorted = [...game.results].sort((a, b) => a.placement - b.placement);
  const deltaLabel = `${point.delta > 0 ? "+" : ""}${Math.round(point.delta * 10) / 10}`;

  return (
    <div className="w-[320px] max-w-[calc(100vw-32px)] rounded-lg border border-border/60 bg-card p-3 shadow-xl">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-xs text-muted-foreground">{new Date(game.created_at).toLocaleString()}</span>
        <Link
          to="/match/$matchId"
          params={{ matchId: game.public_match_id ?? game.id }}
          className="text-[11px] px-1.5 py-0.5 rounded border border-border/60 text-sand font-mono"
        >
          #{game.public_match_id ?? game.id.slice(0, 8)}
        </Link>
      </div>
      <div className="flex flex-wrap gap-1 mb-2">
        {tags.map((tag) => (
          <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary/60 text-secondary-foreground">
            {tag}
          </span>
        ))}
      </div>
      <div className="grid gap-1">
        {sorted.map((result, index) => {
          const isMe = result.player_name.toLowerCase().trim() === playerKey;
          return (
            <div
              key={index}
              className={`flex items-center justify-between gap-2 rounded px-2 py-1 text-xs ${
                isMe ? "bg-sand/15 border border-sand/40 font-semibold" : "bg-background/40"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="inline-flex size-4 items-center justify-center rounded bg-secondary/60 text-[10px] font-bold">
                  {result.placement}
                </span>
                <span className="truncate">
                  {result.player_name}
                  <span className="text-muted-foreground font-normal"> · {result.leader_name ?? "—"}</span>
                </span>
              </div>
              <span className="tabular-nums flex items-center gap-1 shrink-0">
                <span className="text-sand font-display">{result.points}</span>
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
        {metric === "rank" && point.rankAfter != null && (
          <div className="text-teal">
            League rank after match: #{point.rankAfter}
            {point.rankBefore != null ? ` (was #${point.rankBefore})` : " (new on leaderboard)"}
          </div>
        )}
        <div>{SYSTEMS.find((item) => item.k === system)?.label} rating after match: {Math.round(point.rating)}</div>
      </div>
    </div>
  );
}
