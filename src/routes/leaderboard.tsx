import { createFileRoute, Link } from "@tanstack/react-router";
import { Navbar } from "@/components/Navbar";
import { LeagueSeasonBanner } from "@/components/LeagueSeasonBanner";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { GAME_VERSIONS, type GameVersion } from "@/lib/game-version";
import { Trophy, Search, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { useChampions, isChampion } from "@/lib/champions";
import { usePlayerTitles, colorForKey } from "@/lib/player-title";
import { AccountBadges, useDiscordLinks } from "@/components/AccountBadges";


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

type SortKey = "elo" | "vp_elo" | "games_played" | "wins" | "top2" | "win_pct";
type SortDir = "desc" | "asc" | null;

function Leaderboard() {
  const [version, setVersion] = useState<GameVersion | "league">("league");
  const [allRows, setAllRows] = useState<Row[]>([]);
  const [vpElos, setVpElos] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [minGames, setMinGames] = useState(3);
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [myKeys, setMyKeys] = useState<Set<string>>(new Set());
  const champions = useChampions();
  const titles = usePlayerTitles();


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
    if (version === "league") return;
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

  useEffect(() => {
    if (version !== "overall") { setVpElos({}); return; }
    (async () => {
      const PAGE = 1000;
      const map: Record<string, number> = {};
      let from = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from("sandbox_player_ratings")
          .select("player_key, overall_vp_elo")
          .eq("game_version", "overall")
          .range(from, from + PAGE - 1);
        if (error || !data || data.length === 0) break;
        for (const r of data as { player_key: string; overall_vp_elo: number | null }[]) {
          if (r.overall_vp_elo !== null) map[r.player_key] = Number(r.overall_vp_elo);
        }
        if (data.length < PAGE) break;
        from += PAGE;
      }
      setVpElos(map);
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
        const getV = (r: Row) =>
          sortKey === "win_pct"
            ? r.games_played ? r.wins / r.games_played : 0
            : sortKey === "vp_elo"
              ? (vpElos[r.player_key] ?? -Infinity)
              : Number(r[sortKey]);
        const av = getV(a);
        const bv = getV(b);
        if (av === bv) return a.player_key.localeCompare(b.player_key);
        return av < bv ? dir : -dir;
      });
    }
    return filtered;
  }, [allRows, q, minGames, sortKey, sortDir, vpElos]);

  const total = processed.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const startRank = page * PAGE_SIZE;
  const filtered = processed.slice(startRank, startRank + PAGE_SIZE);
  const discordLinks = useDiscordLinks(filtered.map((r) => r.player_key));

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

        <Tabs value={version} onValueChange={(v) => setVersion(v as GameVersion | "league")}>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between mb-4">
            <TabsList className="bg-card/60 border border-border/60 flex-wrap h-auto">
              <TabsTrigger value="league" className="data-[state=active]:bg-sand data-[state=active]:text-sand-foreground">League</TabsTrigger>
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

          <TabsContent value="league">
            <LeagueBoard q={q} minGames={minGames} />
          </TabsContent>
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
                        {v.value === "overall" && <SortHeader label="ELO VP" k="vp_elo" />}
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
                                  className="hover:underline underline-offset-2"
                                  style={{ color: colorForKey(titles, r.player_key) }}
                                >

                                  <span className="inline-flex items-center gap-1">
                                    {isChampion(champions, r.player_key) && (
                                      <Trophy className="size-3.5 text-sand" aria-label="Hall of Fame Champion" />
                                    )}
                                    {r.display_name}
                                  </span>
                                </Link>
                              </td>
                              <td className="px-4 py-3 text-right font-display text-sand tabular-nums">
                                {Math.round(Number(r.elo))}
                              </td>
                              {v.value === "overall" && (
                                <td className="px-4 py-3 text-right font-display text-teal tabular-nums">
                                  {vpElos[r.player_key] !== undefined ? Math.round(vpElos[r.player_key]) : "—"}
                                </td>
                              )}
                              <td className="px-4 py-3 text-right tabular-nums">{r.games_played}</td>
                              <td className="px-4 py-3 text-right tabular-nums">{r.wins}</td>
                              <td className="px-4 py-3 text-right tabular-nums hidden sm:table-cell">{r.top2}</td>
                              <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                                {winPct.toFixed(0)}%
                              </td>
                              <td className="px-4 py-3 text-right">
                                <AccountBadges playerKey={r.player_key} webClaimed={claimedAnywhere} discord={discordLinks[r.player_key.toLowerCase()]} />
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

type LeagueRow = { player_key: string; elo: number; games_played: number; wins: number; top2: number; claimed_by: string | null };

function LeagueBoard({ q, minGames }: { q: string; minGames: number }) {
  const [season, setSeason] = useState<number | null>(null);
  const [seasons, setSeasons] = useState<number[]>([]);
  const [rows, setRows] = useState<LeagueRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<"elo" | "games_played" | "wins" | "top2" | "win_pct">("elo");
  const [sortAsc, setSortAsc] = useState(false);
  const champions = useChampions();
  const titles = usePlayerTitles();

  useEffect(() => {
    void supabase.from("player_league_ratings").select("season").order("season", { ascending: false }).limit(1000).then(({ data }) => {
      const list = [...new Set((data ?? []).map((r) => r.season))];
      setSeasons(list);
      setSeason((s) => s ?? list[0] ?? null);
      if (!list.length) setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (season == null) return;
    setLoading(true);
    void (async () => {
      const { data } = await supabase.from("player_league_ratings").select("player_key,elo,games_played,wins").eq("season", season).order("elo", { ascending: false }).limit(1000);
      const base = data ?? [];
      const keys = base.map((r) => r.player_key);
      const nameMap: Record<string, string> = {};
      const claimMap: Record<string, string | null> = {};
      const top2: Record<string, number> = {};
      if (keys.length) {
        const fetchDeltas = async () => {
          const out: { game_id: string; player_key: string }[] = [];
          for (let from = 0; ; from += 1000) {
            const { data: page } = await supabase.from("league_match_rating_deltas").select("game_id,player_key").eq("season", season).order("game_id").order("player_key").range(from, from + 999);
            out.push(...(page ?? []));
            if (!page || page.length < 1000) break;
          }
          return out;
        };
        const [{ data: pr }, deltas] = await Promise.all([
          supabase.from("player_ratings").select("player_key,display_name,claimed_by").eq("game_version", "overall").in("player_key", keys),
          fetchDeltas(),
        ]);
        for (const r of pr ?? []) { nameMap[r.player_key] = r.display_name; claimMap[r.player_key] = r.claimed_by; }
        const gameIds = [...new Set(deltas.map((d) => d.game_id))];
        if (gameIds.length) {
          const gr: { game_id: string; player_name: string; placement: number }[] = [];
          for (let i = 0; i < gameIds.length; i += 150) {
            const { data: chunk } = await supabase.from("game_results").select("game_id,player_name,placement").in("game_id", gameIds.slice(i, i + 150)).lte("placement", 2);
            gr.push(...(chunk ?? []));
          }
          const byGame = new Map<string, string[]>();
          for (const d of deltas ?? []) byGame.set(d.game_id, [...(byGame.get(d.game_id) ?? []), d.player_key]);
          const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
          for (const g of gr ?? []) {
            const n = norm(g.player_name);
            const k = (byGame.get(g.game_id) ?? []).find((pk) => norm(pk) === n || norm(nameMap[pk] ?? "") === n);
            if (k) top2[k] = (top2[k] ?? 0) + 1;
          }
        }
      }
      setNames(nameMap);
      setRows(base.map((r) => ({ ...r, elo: Number(r.elo), top2: top2[r.player_key] ?? 0, claimed_by: claimMap[r.player_key] ?? null })));
      setLoading(false);
    })();
  }, [season]);

  const term = q.trim().toLowerCase();
  const val = (r: LeagueRow) =>
    sortKey === "win_pct" ? (r.games_played ? r.wins / r.games_played : 0)
    : sortKey === "top2" ? (r.games_played ? r.top2 / r.games_played : 0)
    : r[sortKey];
  const ranked = [...rows].sort((a, b) => b.elo - a.elo);
  const rankOf = new Map(ranked.map((r, i) => [r.player_key, i]));
  const shown = rows
    .filter((r) => r.games_played >= Math.max(minGames, 1) && (!term || r.player_key.includes(term) || (names[r.player_key] ?? "").toLowerCase().includes(term)))
    .sort((a, b) => (sortAsc ? val(a) - val(b) : val(b) - val(a)));
  const discordLinks = useDiscordLinks(shown.slice(0, 200).map((r) => r.player_key));

  const Head = ({ label, k, className = "" }: { label: string; k: typeof sortKey; className?: string }) => (
    <th className={`px-4 py-3 text-right ${className}`}>
      <button
        type="button"
        onClick={() => (sortKey === k ? setSortAsc((a) => !a) : (setSortKey(k), setSortAsc(false)))}
        className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground ${sortKey === k ? "text-sand" : ""}`}
      >
        {label}
        {sortKey === k ? (sortAsc ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : <ArrowUpDown className="size-3 opacity-50" />}
      </button>
    </th>
  );

  return (
    <Card className="p-0 overflow-hidden border-border/60 bg-card/70 shadow-arena">
      <div className="p-3 border-b border-border/60 space-y-2">
        <LeagueSeasonBanner seasonId={season} />
        {seasons.length > 1 && (
          <div className="flex gap-2 items-center text-sm">
            Season
            <select value={season ?? ""} onChange={(e) => setSeason(Number(e.target.value))} className="bg-input border border-border rounded px-2 py-1">
              {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 text-left w-16">Rank</th>
              <th className="px-4 py-3 text-left">Player</th>
              <Head label="League Elo" k="elo" />
              <Head label="Games" k="games_played" />
              <Head label="Wins" k="wins" />
              <Head label="Top 2" k="top2" className="hidden sm:table-cell" />
              <Head label="Win %" k="win_pct" className="hidden md:table-cell" />
              <th className="px-4 py-3 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">Loading rankings…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">No League games rated yet{season ? ` in season ${season}` : ""}.</td></tr>
            ) : shown.map((r) => {
              const rank = rankOf.get(r.player_key) ?? 0;
              const medal = rank === 0 ? "bg-sand text-sand-foreground" : rank === 1 ? "bg-teal/80 text-background" : rank === 2 ? "bg-coral/90 text-white" : "bg-muted text-muted-foreground";
              const winPct = r.games_played ? (r.wins / r.games_played) * 100 : 0;
              return (
                <tr key={r.player_key} className="border-t border-border/40 hover:bg-secondary/30">
                  <td className="px-4 py-3">
                    <span className={`inline-flex size-7 items-center justify-center rounded font-bold text-xs ${medal}`}>{rank + 1}</span>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <Link to="/players/$key" params={{ key: r.player_key }} className="hover:underline underline-offset-2" style={{ color: colorForKey(titles, r.player_key) }}>
                      <span className="inline-flex items-center gap-1">
                        {isChampion(champions, r.player_key) && <Trophy className="size-3.5 text-sand" aria-label="Hall of Fame Champion" />}
                        {names[r.player_key] ?? r.player_key}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right font-display text-sand tabular-nums">{Math.round(r.elo)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.games_played}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.wins}</td>
                  <td className="px-4 py-3 text-right tabular-nums hidden sm:table-cell">{r.games_played ? Math.round((r.top2 / r.games_played) * 100) : 0}%</td>
                  <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">{winPct.toFixed(0)}%</td>
                  <td className="px-4 py-3 text-right">
                    <AccountBadges playerKey={r.player_key} webClaimed={!!r.claimed_by} discord={discordLinks[r.player_key.toLowerCase()]} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
