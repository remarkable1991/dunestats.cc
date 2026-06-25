import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { GAME_VERSIONS, type GameVersion } from "@/lib/game-version";
import { LEADERS, classifyLeader } from "@/lib/leaders";
import { BarChart3 } from "lucide-react";

export const Route = createFileRoute("/stats")({
  head: () => ({ meta: [{ title: "Leader stats · Strategy Arena" }] }),
  component: StatsPage,
});

type Row = {
  placement: number;
  leader_name: string | null;
  points: number;
  games: { game_version: GameVersion } | null;
};

type Agg = {
  leader: string;
  group: "base" | "ix" | "uprising" | "other";
  picks: number;
  wins: number;
  top2: number;
  totalPoints: number;
};

const CANON = new Map<string, string>();
for (const g of ["base", "ix", "uprising"] as const) {
  for (const name of LEADERS[g]) {
    CANON.set(normalize(name), name);
  }
}

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalize(raw: string | null): { name: string; group: Agg["group"] } | null {
  if (!raw) return null;
  const n = normalize(raw);
  if (!n) return null;
  // Try exact match first
  if (CANON.has(n)) {
    const name = CANON.get(n)!;
    const g = classifyLeader(name);
    return { name, group: g ?? "other" };
  }
  // Substring against canonical lower-case
  for (const [key, name] of CANON) {
    if (n.includes(key) || key.includes(n)) {
      const g = classifyLeader(name);
      return { name, group: g ?? "other" };
    }
  }
  const g = classifyLeader(raw);
  return { name: raw, group: g ?? "other" };
}

function StatsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState<GameVersion>("base");

  useEffect(() => {
    setLoading(true);
    supabase
      .from("game_results")
      .select("placement, leader_name, points, games!inner(game_version)")
      .limit(20000)
      .then(({ data }) => {
        setRows((data as unknown as Row[]) ?? []);
        setLoading(false);
      });
  }, []);

  const { aggregates, totalGames } = useMemo(() => {
    const filtered = rows.filter((r) => r.games?.game_version === version);
    // Count distinct games is tricky without IDs; pick count = total rows / avg players. Use sum/4 estimate via leader picks summing to total player slots.
    // For pick rate we use share of player-slots in this version.
    const totalSlots = filtered.length;
    const map = new Map<string, Agg>();
    for (const r of filtered) {
      const c = canonicalize(r.leader_name);
      if (!c) continue;
      const key = c.name;
      const a = map.get(key) ?? {
        leader: c.name,
        group: c.group,
        picks: 0,
        wins: 0,
        top2: 0,
        totalPoints: 0,
      };
      a.picks += 1;
      if (r.placement === 1) a.wins += 1;
      if (r.placement <= 2) a.top2 += 1;
      a.totalPoints += r.points;
      map.set(key, a);
    }
    const aggregates = Array.from(map.values()).sort((a, b) => b.picks - a.picks);
    return { aggregates, totalGames: totalSlots };
  }, [rows, version]);

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto px-4 py-10">
        <div className="flex items-center gap-3 mb-2">
          <BarChart3 className="size-7 text-sand" />
          <h1 className="font-display text-3xl">Leader stats</h1>
        </div>
        <p className="text-muted-foreground mb-6">
          Pick rate (share of seats this leader filled) and win rate per leader, by leaderboard version.
        </p>

        <Tabs value={version} onValueChange={(v) => setVersion(v as GameVersion)}>
          <TabsList className="bg-card/60 border border-border/60 mb-4">
            {GAME_VERSIONS.map((v) => (
              <TabsTrigger
                key={v.value}
                value={v.value}
                className="data-[state=active]:bg-sand data-[state=active]:text-sand-foreground"
              >
                {v.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {GAME_VERSIONS.map((v) => (
            <TabsContent key={v.value} value={v.value}>
              <Card className="p-0 overflow-hidden border-border/60 bg-card/70 shadow-arena">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="px-4 py-3 text-left">Leader</th>
                        <th className="px-4 py-3 text-left">Group</th>
                        <th className="px-4 py-3 text-right">Picks</th>
                        <th className="px-4 py-3 text-right">Pick %</th>
                        <th className="px-4 py-3 text-right">Wins</th>
                        <th className="px-4 py-3 text-right">Win %</th>
                        <th className="px-4 py-3 text-right hidden sm:table-cell">Top 2 %</th>
                        <th className="px-4 py-3 text-right hidden md:table-cell">Avg pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading && (
                        <tr>
                          <td colSpan={8} className="py-10 text-center text-muted-foreground">
                            Loading stats…
                          </td>
                        </tr>
                      )}
                      {!loading &&
                        aggregates.map((a) => {
                          const pickPct = totalGames ? (a.picks / totalGames) * 100 : 0;
                          const winPct = a.picks ? (a.wins / a.picks) * 100 : 0;
                          const top2Pct = a.picks ? (a.top2 / a.picks) * 100 : 0;
                          const avgPts = a.picks ? a.totalPoints / a.picks : 0;
                          return (
                            <tr key={a.leader} className="border-t border-border/40 hover:bg-secondary/30">
                              <td className="px-4 py-3 font-medium">{a.leader}</td>
                              <td className="px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground">
                                {a.group}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums">{a.picks}</td>
                              <td className="px-4 py-3 text-right tabular-nums text-sand">{pickPct.toFixed(1)}%</td>
                              <td className="px-4 py-3 text-right tabular-nums">{a.wins}</td>
                              <td className="px-4 py-3 text-right tabular-nums text-coral">{winPct.toFixed(1)}%</td>
                              <td className="px-4 py-3 text-right tabular-nums hidden sm:table-cell">
                                {top2Pct.toFixed(1)}%
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                                {avgPts.toFixed(1)}
                              </td>
                            </tr>
                          );
                        })}
                      {!loading && aggregates.length === 0 && (
                        <tr>
                          <td colSpan={8} className="py-10 text-center text-muted-foreground">
                            No data for {v.label} yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
              <p className="text-xs text-muted-foreground mt-3">
                Based on {totalGames} player-seat results in {v.label}.
              </p>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}