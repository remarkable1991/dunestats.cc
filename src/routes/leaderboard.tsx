import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { GAME_VERSIONS } from "@/lib/game-version";
import { Trophy, Search } from "lucide-react";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({ meta: [{ title: "Leaderboard · Strategy Arena" }] }),
  component: Leaderboard,
});

type Row = {
  display_name: string;
  elo: number;
  games_played: number;
  wins: number;
  top2: number;
  total_points: number;
};

function Leaderboard() {
  const [version, setVersion] = useState<string>("base");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [minGames, setMinGames] = useState(3);

  useEffect(() => {
    setLoading(true);
    supabase
      .from("player_ratings")
      .select("display_name, elo, games_played, wins, top2, total_points")
      .eq("game_version", version)
      .order("elo", { ascending: false })
      .limit(500)
      .then(({ data }) => {
        setRows((data as Row[]) ?? []);
        setLoading(false);
      });
  }, [version]);

  const filtered = useMemo(() => {
    const needle = q.toLowerCase().trim();
    return rows
      .filter((r) => r.games_played >= minGames)
      .filter((r) => !needle || r.display_name.toLowerCase().includes(needle));
  }, [rows, q, minGames]);

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto px-4 py-10">
        <div className="flex items-center gap-3 mb-6">
          <Trophy className="size-7 text-sand" />
          <h1 className="font-display text-3xl sm:text-4xl">Community Leaderboard</h1>
        </div>
        <p className="text-muted-foreground max-w-2xl mb-8">
          Standard multiplayer ELO (start 1000, K=32). Pairwise scoring across each match — climb by finishing ahead of
          stronger opponents.
        </p>

        <Tabs value={version} onValueChange={setVersion}>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between mb-4">
            <TabsList className="bg-card/60 border border-border/60">
              {GAME_VERSIONS.map((v) => (
                <TabsTrigger key={v.value} value={v.value} className="data-[state=active]:bg-sand data-[state=active]:text-sand-foreground">
                  {v.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <div className="flex gap-2 items-center">
              <label className="text-xs text-muted-foreground flex items-center gap-2">
                Min games
                <select
                  value={minGames}
                  onChange={(e) => setMinGames(Number(e.target.value))}
                  className="bg-input border border-border rounded px-2 py-1 text-sm"
                >
                  {[1, 3, 5, 10, 20].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search player…"
                  className="pl-8 w-56"
                />
              </div>
            </div>
          </div>

          {GAME_VERSIONS.map((v) => (
            <TabsContent key={v.value} value={v.value}>
              <Card className="p-0 overflow-hidden border-border/60 bg-card/70 shadow-arena">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="px-4 py-3 text-left w-16">Rank</th>
                        <th className="px-4 py-3 text-left">Player</th>
                        <th className="px-4 py-3 text-right">ELO</th>
                        <th className="px-4 py-3 text-right">Games</th>
                        <th className="px-4 py-3 text-right">Wins</th>
                        <th className="px-4 py-3 text-right hidden sm:table-cell">Top 2</th>
                        <th className="px-4 py-3 text-right hidden md:table-cell">Win %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading && (
                        <tr>
                          <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                            Loading rankings…
                          </td>
                        </tr>
                      )}
                      {!loading && filtered.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                            No players match the filters.
                          </td>
                        </tr>
                      )}
                      {!loading &&
                        filtered.map((r, i) => {
                          const winPct = r.games_played ? (r.wins / r.games_played) * 100 : 0;
                          const medal =
                            i === 0
                              ? "bg-sand text-sand-foreground"
                              : i === 1
                                ? "bg-teal/80 text-background"
                                : i === 2
                                  ? "bg-coral/90 text-white"
                                  : "bg-muted text-muted-foreground";
                          return (
                            <tr key={r.display_name} className="border-t border-border/40 hover:bg-secondary/30">
                              <td className="px-4 py-3">
                                <span className={`inline-flex size-7 items-center justify-center rounded font-bold text-xs ${medal}`}>
                                  {i + 1}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-medium">{r.display_name}</td>
                              <td className="px-4 py-3 text-right font-display text-sand tabular-nums">
                                {Math.round(Number(r.elo))}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums">{r.games_played}</td>
                              <td className="px-4 py-3 text-right tabular-nums">{r.wins}</td>
                              <td className="px-4 py-3 text-right tabular-nums hidden sm:table-cell">{r.top2}</td>
                              <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                                {winPct.toFixed(0)}%
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </Card>
              <p className="text-xs text-muted-foreground mt-3">
                Showing {filtered.length} of {rows.length} players for {v.label}.
              </p>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
