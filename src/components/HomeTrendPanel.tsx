import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { X } from "lucide-react";
import { bucketEvents, loadTrend, RANGE_LABELS, type TrendEvent, type TrendMetric, type TrendPoint, type TrendRange } from "@/lib/home-trends";

const TITLES: Record<TrendMetric, string> = {
  games: "Games logged",
  leagueGames: "League games played",
  players: "Active competitors",
  leaguePlayers: "League competitors",
  lobbies: "Lobbies hosted",
  tournaments: "Games logged per tournament",
};

export function HomeTrendPanel({ metric, onClose }: { metric: TrendMetric; onClose: () => void }) {
  const [range, setRange] = useState<TrendRange>("day");
  const [cumulative, setCumulative] = useState(false);
  const [data, setData] = useState<{ events: TrendEvent[]; turnout?: TrendPoint[] } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setData(null);
    setError(false);
    loadTrend(metric).then((d) => active && setData(d)).catch(() => active && setError(true));
    return () => { active = false; };
  }, [metric]);

  const keyed = metric === "players" || metric === "leaguePlayers";
  const points = useMemo(() => {
    if (!data) return [];
    if (data.turnout) return data.turnout;
    return bucketEvents(data.events, range, new Date(), cumulative && range !== "hourOfDay");
  }, [data, range, cumulative]);

  const isTournament = metric === "tournaments";
  const line = cumulative && range !== "hourOfDay" && !isTournament;
  const unit = keyed ? (line ? "players seen" : "unique players") : isTournament ? "games" : metric === "lobbies" ? "lobbies" : "games";
  const total = points.reduce((s, p) => s + p.value, 0);
  const last = points.at(-1)?.value ?? 0;
  const prev = points.at(-2)?.value ?? 0;
  const change = !line && range !== "hourOfDay" && !isTournament && prev > 0 ? Math.round(((last - prev) / prev) * 100) : null;

  const btn = (on: boolean) =>
    `rounded-full border px-3 py-1 text-xs transition-colors ${on ? "border-sand bg-sand/20 text-sand" : "border-border/60 text-muted-foreground hover:text-foreground"}`;

  return (
    <div className="animate-in fade-in slide-in-from-top-2 duration-300 rounded-lg border border-sand/30 bg-background/40 p-4 text-left">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-bold">{TITLES[metric]}</h3>
          {data && !isTournament && (
            <p className="text-xs text-muted-foreground">
              {line ? `${last.toLocaleString()} ${unit} in total` : keyed ? `Latest period: ${last.toLocaleString()} ${unit}` : `${total.toLocaleString()} ${unit} in this view`}
              {change != null && <span className={change >= 0 ? "text-sand" : "text-destructive"}> · {change >= 0 ? "+" : ""}{change}% vs previous period</span>}
            </p>
          )}
        </div>
        <button onClick={onClose} aria-label="Close chart" className="rounded p-1 text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
      </div>
      {!isTournament && (
        <div className="mt-3 flex flex-wrap gap-2">
          {(Object.keys(RANGE_LABELS) as TrendRange[]).map((r) => (
            <button key={r} className={btn(range === r)} onClick={() => setRange(r)}>{RANGE_LABELS[r]}</button>
          ))}
          {range !== "hourOfDay" && (
            <button className={btn(cumulative)} onClick={() => setCumulative((c) => !c)}>Cumulative</button>
          )}
        </div>
      )}
      <div className="mt-4 h-56 sm:h-64">
        {error ? (
          <p className="pt-20 text-center text-sm text-muted-foreground">Couldn't load this chart.</p>
        ) : !data ? (
          <p className="pt-20 text-center text-sm text-muted-foreground">Loading…</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {line ? (
              <LineChart data={points}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} minTickGap={20} />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} width={40} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} formatter={(v: number) => [v.toLocaleString(), unit]} />
                <Line type="monotone" dataKey="value" stroke="var(--sand)" strokeWidth={2} dot={false} />
              </LineChart>
            ) : (
              <BarChart data={points}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} minTickGap={12} />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} width={40} allowDecimals={false} />
                <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.3 }} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} formatter={(v: number) => [v.toLocaleString(), unit]} />
                <Bar dataKey="value" fill="var(--sand)" radius={[3, 3, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
      {range === "hourOfDay" && !isTournament && <p className="mt-2 text-xs text-muted-foreground">All-time activity by hour of day (UTC) — handy for finding when lobbies fill fastest.</p>}
    </div>
  );
}
