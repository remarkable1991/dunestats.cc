import { createFileRoute, Link } from "@tanstack/react-router";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { GAME_VERSIONS, type GameVersion } from "@/lib/game-version";
import { Trophy, Search, UserPlus, BadgeCheck, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({ meta: [{ title: "Leaderboard · Strategy Arena" }] }),
  component: Leaderboard,
});

type Row = {
  player_key: string;
  display_name: string;
  elo: number;
  games_played: number;
  wins: number;
  top2: number;
  total_points: number;
  claimed_by: string | null;
};

const PAGE_SIZE = 50;

type SortKey = "elo" | "games_played" | "wins" | "top2" | "win_pct";
type SortDir = "desc" | "asc" | null;

function Leaderboard() {
  const [version, setVersion] = useState<GameVersion>("overall");
  const [allRows, setAllRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [minGames, setMinGames] = useState(3);
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [myKeys, setMyKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUserId(s?.user?.id ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) { setMyKeys(new Set()); return; }
    (async () => {
      const { data } = await supabase
        .from("player_ratings")
        .select("player_key")
        .eq("claimed_by", userId);
      setMyKeys(new Set((data ?? []).map((r) => r.player_key)));
    })();
  }, [userId]);

  useEffect(() => {
    setPage(0);
  }, [version, minGames, q, sortKey, sortDir]);

  useEffect(() => {
    setLoading(true);
    (async () => {
      const PAGE = 1000;
      const out: Row[] = [];
      let from = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from("player_ratings")
          .select("player_key, display_name, elo, games_played, wins, top2, total_points, claimed_by")
          .eq("game_version", version)
          .order("elo", { ascending: false })
          .order("player_key", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error || !data || data.length === 0) break;
        out.push(...(data as Row[]));
        if (data.length < PAGE) break;
        from += PAGE;
      }
      setAllRows(out);
      setLoading(false);
    })();
  }, [version]);

  const processed = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = allRows.filter(
      (r) =>
        r.games_played >= minGames &&
        (!needle || r.display_name.toLowerCase().includes(needle)),
    );
    if (sortKey && sortDir) {
      const dir = sortDir === "desc" ? -1 : 1;
      filtered.sort((a, b) => {
        const av = sortKey === "win_pct" ? (a.games_played ? a.wins / a.games_played : 0) : Number(a[sortKey]);
        const bv = sortKey === "win_pct" ? (b.games_played ? b.wins / b.games_played : 0) : Number(b[sortKey]);
        if (av === bv) return a.player_key.localeCompare(b.player_key);
        return av < bv ? dir : -dir;
      });
    }
    return filtered;
  }, [allRows, q, minGames, sortKey, sortDir]);

  const total = processed.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const startRank = page * PAGE_SIZE;
  const filtered = processed.slice(startRank, startRank + PAGE_SIZE);

  function cycleSort(key: SortKey) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("desc");
    } else if (sortDir === "desc") {
      setSortDir("asc");
    } else {
      setSortKey(null);
      setSortDir(null);
    }
  }

  function SortHeader({
    label,
    k,
    className = "",
  }: {
    label: string;
    k: SortKey;
    className?: string;
  }) {
    const active = sortKey === k;
    const Icon = active ? (sortDir === "desc" ? ArrowDown : ArrowUp) : ArrowUpDown;
    return (
      <th className={`px-4 py-3 text-right ${className}`}>
        <button
          type="button"
          onClick={() => cycleSort(k)}
          className={`inline-flex items-center gap-1 ml-auto hover:text-sand transition-colors ${
            active ? "text-sand" : ""
          }`}
        >
          {label}
          <Icon className={`size-3 ${active ? "opacity-100" : "opacity-40"}`} />
        </button>
      </th>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto px-4 py-10">
        <div className="flex items-center gap-3 mb-6">
          <Trophy className="size-7 text-sand" />
          <h1 className="font-display text-3xl sm:text-4xl">Community Leaderboard</h1>
        </div>
        <p className="text-muted-foreground max-w-2xl mb-8">
          Standard multiplayer ELO (start 1000, K=32). Every match counts twice: once in the lifetime{" "}
          <span className="text-sand">Overall</span> track, and once in the matching expansion track.
        </p>

        <Tabs value={version} onValueChange={(v) => setVersion(v as GameVersion)}>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between mb-4">
            <TabsList className="bg-card/60 border border-border/60 flex-wrap h-auto">
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
                  {[0, 1, 3, 5, 10, 20].map((n) => (
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
                        <SortHeader label="ELO" k="elo" />
                        <SortHeader label="Games" k="games_played" />
                        <SortHeader label="Wins" k="wins" />
                        <SortHeader label="Top 2" k="top2" className="hidden sm:table-cell" />
                        <SortHeader label="Win %" k="win_pct" className="hidden md:table-cell" />
                        <th className="px-4 py-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading && (
                        <tr>
                          <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                            Loading rankings…
                          </td>
                        </tr>
                      )}
                      {!loading && filtered.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                            No players match the filters.
                          </td>
                        </tr>
                      )}
                      {!loading &&
                        filtered.map((r, i) => {
                          const winPct = r.games_played ? (r.wins / r.games_played) * 100 : 0;
                          const absoluteRank = startRank + i;
                          const medal =
                            absoluteRank === 0
                              ? "bg-sand text-sand-foreground"
                              : absoluteRank === 1
                                ? "bg-teal/80 text-background"
                                : absoluteRank === 2
                                  ? "bg-coral/90 text-white"
                                  : "bg-muted text-muted-foreground";
                          const isMe = !!userId && (r.claimed_by === userId || myKeys.has(r.player_key));
                          const claimedAnywhere = !!r.claimed_by || myKeys.has(r.player_key);
                          return (
                            <tr
                              key={r.player_key}
                              className={`border-t border-border/40 hover:bg-secondary/30 ${
                                isMe ? "bg-sand/10 ring-1 ring-inset ring-sand/60" : ""
                              }`}
                            >
                              <td className="px-4 py-3">
                                <span className={`inline-flex size-7 items-center justify-center rounded font-bold text-xs ${medal}`}>
                                  {absoluteRank + 1}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-medium">
                                <Link
                                  to="/players/$key"
                                  params={{ key: r.player_key }}
                                  className="hover:text-sand"
                                >
                                  {r.display_name}
                                </Link>
                              </td>
                              <td className="px-4 py-3 text-right font-display text-sand tabular-nums">
                                {Math.round(Number(r.elo))}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums">{r.games_played}</td>
                              <td className="px-4 py-3 text-right tabular-nums">{r.wins}</td>
                              <td className="px-4 py-3 text-right tabular-nums hidden sm:table-cell">{r.top2}</td>
                              <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                                {winPct.toFixed(0)}%
                              </td>
                              <td className="px-4 py-3 text-right">
                                {claimedAnywhere ? (
                                  <span className="inline-flex items-center gap-1 text-xs text-teal">
                                    <BadgeCheck className="size-3.5" /> Claimed
                                  </span>
                                ) : (
                                  <Link
                                    to="/claim"
                                    search={{ player: r.player_key }}
                                    className="inline-flex items-center gap-1 text-xs text-coral hover:text-sand underline-offset-2 hover:underline"
                                  >
                                    <UserPlus className="size-3.5" /> Unclaimed, claim now
                                  </Link>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </Card>
              <div className="flex items-center justify-between mt-3 gap-3 flex-wrap">
                <p className="text-xs text-muted-foreground">
                  Showing {filtered.length === 0 ? 0 : startRank + 1}–{startRank + filtered.length} of {total} players for {v.label}.
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page === 0 || loading}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    <ChevronLeft className="size-4" /> Prev
                  </Button>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    Page {page + 1} / {pageCount}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page + 1 >= pageCount || loading}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
