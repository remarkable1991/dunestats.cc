import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { GAME_VERSIONS, type GameVersion } from "@/lib/game-version";
import { User as UserIcon, BadgeCheck, Trophy, Medal, ArrowUp, ArrowDown, ArrowUpDown, Target, History, TrendingUp, type LucideIcon } from "lucide-react";
import { EloHistoryChart } from "@/components/EloHistoryChart";

import { ScreenshotButton } from "@/components/ScreenshotButton";
import { EloDeltaLine, TournamentTag } from "@/components/EloDelta";
import { useChampions, isChampion, winCount } from "@/lib/champions";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { AchievementBadge, ratio, type Achievement } from "@/components/AchievementBadge";

export const Route = createFileRoute("/players/$key")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.key} · Player profile` },
      { name: "description", content: `Dune Imperium competitive profile for ${params.key}: ELO rating, win rate, match history and tournament results on Strategy Arena.` },
      { property: "og:title", content: `${params.key} · Player profile` },
      { property: "og:description", content: `Dune Imperium competitive profile for ${params.key}: ELO rating, win rate and match history.` },
      { property: "og:type", content: "profile" },
      { property: "og:url", content: `https://dunestats.cc/players/${encodeURIComponent(params.key)}` },
    ],
    links: [{ rel: "canonical", href: `https://dunestats.cc/players/${encodeURIComponent(params.key)}` }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ProfilePage",
          url: `https://dunestats.cc/players/${encodeURIComponent(params.key)}`,
          name: `${params.key} · Player profile`,
          isPartOf: { "@id": "https://dunestats.cc/#website" },
          mainEntity: {
            "@type": "Person",
            name: params.key,
            url: `https://dunestats.cc/players/${encodeURIComponent(params.key)}`,
            memberOf: { "@id": "https://dunestats.cc/#organization" },
          },
        }),
      },
    ],
  }),
  component: ProfilePage,
});

type Rating = {
  player_key: string;
  display_name: string;
  game_version: GameVersion;
  elo: number;
  games_played: number;
  wins: number;
  top2: number;
  total_points: number;
  claimed_by: string | null;
};

type MatchRow = {
  placement: number;
  player_name: string;
  leader_name: string | null;
  points: number;
  elo_delta: number | null;
  elo_delta_overall: number | null;
  games: {
    id: string;
    created_at: string;
    game_version: GameVersion;
    board_version: string | null;
    image_url: string | null;
    tournament_num: number | null;
    has_rise_of_ix: boolean | null;
    has_immortality: boolean | null;
    has_epic_mode: boolean | null;
    has_base_leaders: boolean | null;
  } | null;
};

type TriState = "any" | "true" | "false";

function TriSelect({ label, value, onChange }: { label: string; value: TriState; onChange: (v: TriState) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={(v) => onChange(v as TriState)}>
        <SelectTrigger className="h-8 w-[110px] bg-card/60 border-border/60 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="any">Any</SelectItem>
          <SelectItem value="true">Yes</SelectItem>
          <SelectItem value="false">No</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function QuickJump({
  icon: Icon,
  title,
  subtitle,
  target,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  target: string;
}) {
  return (
    <button
      type="button"
      onClick={() =>
        document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" })
      }
      className="group flex items-start gap-3 rounded-lg border border-border/60 bg-card/70 p-4 text-left transition hover:border-sand/60 hover:bg-card"
    >
      <span className="rounded-md border border-sand/30 bg-sand/10 p-2 text-sand">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block font-display text-sm group-hover:text-sand transition-colors">{title}</span>
        <span className="block text-xs text-muted-foreground">{subtitle}</span>
      </span>
    </button>
  );
}

const ACH_TAGS: Array<{ v: string; label: string }> = [
  { v: "all", label: "All Tags" },
  { v: "Base Set", label: "Base Set" },
  { v: "Rise of Ix", label: "Rise of Ix" },
  { v: "Uprising", label: "Uprising" },
  { v: "Leader Play", label: "Leader Play" },
  { v: "Leader Wins", label: "Leader Wins" },
  { v: "Expansion Modes", label: "Expansion Modes" },
  { v: "Tournaments", label: "Tournaments" },
  { v: "Social & Community", label: "Social & Community" },
  { v: "rare", label: "Rare & Legendary" },
];

const PLACEMENT_COLORS = ["#F59E0B", "#CBD5E1", "#B45309", "#DC2626"];

const ORD = ["1st", "2nd", "3rd", "4th"];

function RatingCard({
  label,
  elo,
  rank,
  version,
  p,
}: {
  label: string;
  elo: number | null;
  rank: number | null;
  version: string;
  p: { total: number; c: number[] };
}) {
  const total = p.total;
  const pct = (n: number) => (total ? (n / total) * 100 : 0);
  const [p1, p2, p3, p4] = [pct(p.c[0]), pct(p.c[1]), pct(p.c[2]), pct(p.c[3])];
  const top2 = p1 + p2;
  const f = (n: number) => `${Math.round(n)}%`;

  const top2Cls = top2 > 54 ? "text-emerald-400" : top2 < 46 ? "text-red-400" : "text-sand";
  const p1Cls = p1 > 28 ? "text-emerald-400" : p1 < 22 ? "text-red-400" : "text-foreground/80";
  const p2Cls = p1 < 28 && p2 < 20 ? "text-amber-400" : "text-foreground/80";
  const lowCls = p4 > 26 || p3 + p4 > 52 ? "text-red-400" : "text-foreground/80";
  const cls = [p1Cls, p2Cls, lowCls, lowCls];
  const pcts = [p1, p2, p3, p4];

  return (
    <>
      {/* Row 1: header */}
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-[11px] text-muted-foreground tabular-nums">{total} Games Played</div>
      </div>

      {/* Row 2: elo + rank / top 2 */}
      <div className="mt-1 flex items-end justify-between gap-2">
        <Link
          to="/leaderboard"
          hash={version}
          className="flex items-baseline gap-2 hover:opacity-80 transition-opacity"
        >
          <span className="font-display text-3xl text-sand tabular-nums">{elo != null ? Math.round(elo) : "—"}</span>
          {rank != null && <span className="text-xs text-muted-foreground tabular-nums">#{rank}</span>}
        </Link>
        <span
          className={`rounded-full border border-border/60 bg-secondary/40 px-2 py-0.5 text-[11px] font-semibold tabular-nums ${top2Cls}`}
        >
          Top 2: {total ? f(top2) : "—"}
        </span>
      </div>

      {/* Row 3: placement counts */}
      <div className="mt-2 grid grid-cols-4 gap-1">
        {p.c.map((n, i) => (
          <span
            key={i}
            className={`rounded-full border border-border/60 bg-secondary/40 px-1 py-0.5 text-center text-[10px] tabular-nums ${cls[i]}`}
          >
            {ORD[i]}: {n}x
          </span>
        ))}
      </div>

      {/* Row 4: distribution bar */}
      {total ? (
        <div className="mt-2 flex h-7 w-full overflow-hidden rounded-md bg-secondary/60">
          {pcts.map((w, i) => (
            <div
              key={i}
              title={`${ORD[i]} Place: ${f(w)} (${p.c[i]} games)`}
              style={{ width: `${w}%`, minWidth: "12px", backgroundColor: PLACEMENT_COLORS[i] }}
              className="flex items-center justify-center overflow-hidden"
            >
              {w >= 12 && (
                <span className={`text-[10px] font-bold tabular-nums ${cls[i]}`}>
                  {ORD[i]} {f(w)}
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-2 text-xs text-muted-foreground">No games yet</div>
      )}
    </>
  );
}


function ProfilePage() {

  const { key } = Route.useParams();
  const playerKey = decodeURIComponent(key).toLowerCase().trim();
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [achTab, setAchTab] = useState<"all" | "unlocked" | "progress">("all");
  const [achTag, setAchTag] = useState<string>("all");
  const [achScope, setAchScope] = useState<"lifetime" | "seasonal">("lifetime");
  const [ranks, setRanks] = useState<Record<string, number>>({});

  useEffect(() => {
    let mounted = true;
    if (ratings.length === 0) {
      setRanks({});
      return;
    }
    Promise.all(
      ratings.map(async (r) => {
        const { count } = await supabase
          .from("player_ratings")
          .select("player_key", { count: "exact", head: true })
          .eq("game_version", r.game_version)
          .gt("elo", Number(r.elo));
        return [r.game_version, (count ?? 0) + 1] as const;
      }),
    ).then((entries) => {
      if (mounted) setRanks(Object.fromEntries(entries));
    });
    return () => {
      mounted = false;
    };
  }, [ratings]);


  const champions = useChampions();
  const champion = isChampion(champions, playerKey);
  const tournamentWins = winCount(champions, playerKey);
  const wins = champions.get(playerKey) ?? [];

  useEffect(() => {
    setLoading(true);
    Promise.all([
      supabase
        .from("player_ratings")
        .select("player_key, display_name, game_version, elo, games_played, wins, top2, total_points, claimed_by")
        .eq("player_key", playerKey),
      supabase
        .from("game_results")
        .select("placement, player_name, leader_name, points, elo_delta, elo_delta_overall, games!inner(id, created_at, game_version, board_version, image_url, tournament_num, has_rise_of_ix, has_immortality, has_epic_mode, has_base_leaders)")
        .ilike("player_name", playerKey)
        .order("created_at", { foreignTable: "games", ascending: false })
        .limit(1000),
    ]).then(([r, m]) => {
      setRatings((r.data as Rating[]) ?? []);
      setMatches((m.data as unknown as MatchRow[]) ?? []);
      setLoading(false);
    });
  }, [playerKey]);

  useEffect(() => {
    let mounted = true;
    supabase
      .rpc("get_player_achievements", { p_player_key: playerKey })
      .then(({ data }) => {
        if (!mounted) return;
        const list = (data as unknown as { achievements?: Achievement[] } | null)?.achievements ?? [];
        setAchievements(Array.isArray(list) ? list : []);
      });
    return () => {
      mounted = false;
    };
  }, [playerKey]);

  const closingIn = useMemo(
    () =>
      achievements
        .filter((a) => !a.is_unlocked && ratio(a) >= 0.6 && ratio(a) < 1)
        .sort((a, b) => ratio(b) - ratio(a)),
    [achievements],
  );

  const scopedAchievements = useMemo(
    () => achievements.filter((a) => Boolean(a.is_seasonal) === (achScope === "seasonal")),
    [achievements, achScope],
  );

  const shownAchievements = useMemo(() => {
    let arr = [...scopedAchievements];
    if (achTab === "unlocked") arr = arr.filter((a) => a.is_unlocked);
    if (achTab === "progress") arr = arr.filter((a) => !a.is_unlocked);
    if (achTag === "rare") arr = arr.filter((a) => a.rarity === "Rare" || a.rarity === "Legendary");
    else if (achTag !== "all") arr = arr.filter((a) => (a.tags ?? []).includes(achTag));
    return arr;
  }, [scopedAchievements, achTab, achTag]);

  const placementStats = useMemo(() => {
    const empty = () => ({ total: 0, c: [0, 0, 0, 0] });
    const out: Record<string, { total: number; c: number[] }> = {
      overall: empty(),
      base: empty(),
      ix: empty(),
      uprising: empty(),
    };
    for (const m of matches) {
      const gv = m.games?.game_version;
      const idx = Math.min(4, Math.max(1, m.placement)) - 1;
      out.overall.total += 1;
      out.overall.c[idx] += 1;
      if (gv && out[gv]) {
        out[gv].total += 1;
        out[gv].c[idx] += 1;
      }
    }
    return out;
  }, [matches]);

  const displayName = ratings[0]?.display_name ?? playerKey;
  const claimed = ratings.some((r) => r.claimed_by);

  const [version, setVersion] = useState<GameVersion>("overall");
  const [fImmortality, setFImmortality] = useState<TriState>("any");
  const [fEpic, setFEpic] = useState<TriState>("any");
  const [fRiseOfIx, setFRiseOfIx] = useState<TriState>("any");
  const [fBaseLeaders, setFBaseLeaders] = useState<TriState>("any");

  useEffect(() => {
    if (version !== "ix") setFEpic("any");
    if (version !== "uprising") { setFRiseOfIx("any"); setFBaseLeaders("any"); }
  }, [version]);

  const filteredMatches = useMemo(() => {
    const matchBool = (state: TriState, val: boolean | null | undefined) => {
      if (state === "any") return true;
      return Boolean(val) === (state === "true");
    };
    return matches.filter((m) => {
      if (version !== "overall" && m.games?.game_version !== version) return false;
      if (!matchBool(fImmortality, m.games?.has_immortality)) return false;
      if (version === "ix" && !matchBool(fEpic, m.games?.has_epic_mode)) return false;
      if (version === "uprising" && !matchBool(fRiseOfIx, m.games?.has_rise_of_ix)) return false;
      if (version === "uprising" && !matchBool(fBaseLeaders, m.games?.has_base_leaders)) return false;
      return true;
    });
  }, [matches, version, fImmortality, fEpic, fRiseOfIx, fBaseLeaders]);

  const leaderStats = useMemo(() => {
    const map = new Map<string, { leader: string; picks: number; wins: number; totalPoints: number }>();
    for (const m of filteredMatches) {
      const lead = m.leader_name?.trim() || "Unknown";
      const a = map.get(lead) ?? { leader: lead, picks: 0, wins: 0, totalPoints: 0 };
      a.picks += 1;
      if (m.placement === 1) a.wins += 1;
      a.totalPoints += m.points;
      map.set(lead, a);
    }
    return Array.from(map.values());
  }, [filteredMatches]);

  type LSortKey = "leader" | "picks" | "wins" | "winPct" | "avgPts";
  const [lSortKey, setLSortKey] = useState<LSortKey | null>("picks");
  const [lSortDir, setLSortDir] = useState<"desc" | "asc" | null>("desc");
  function cycleLSort(k: LSortKey) {
    if (lSortKey !== k) { setLSortKey(k); setLSortDir(k === "leader" ? "asc" : "desc"); }
    else if (lSortDir === "desc") setLSortDir("asc");
    else if (lSortDir === "asc") { setLSortKey(null); setLSortDir(null); }
  }
  const sortedLeaderStats = useMemo(() => {
    if (!lSortKey || !lSortDir) return leaderStats;
    const dir = lSortDir === "desc" ? -1 : 1;
    const arr = [...leaderStats];
    arr.sort((a, b) => {
      if (lSortKey === "leader") return a.leader.localeCompare(b.leader) * (dir === -1 ? -1 : 1);
      const score = (x: typeof a) => {
        if (lSortKey === "picks") return x.picks;
        if (lSortKey === "wins") return x.wins;
        if (lSortKey === "winPct") return x.picks ? x.wins / x.picks : 0;
        return x.picks ? x.totalPoints / x.picks : 0;
      };
      const av = score(a), bv = score(b);
      if (av === bv) return a.leader.localeCompare(b.leader);
      return av < bv ? -dir : av > bv ? dir : 0;
    });
    return arr;
  }, [leaderStats, lSortKey, lSortDir]);
  function LSortTh({ label, k, align = "right", className = "" }: { label: string; k: LSortKey; align?: "left" | "right"; className?: string }) {
    const active = lSortKey === k;
    const Icon = active ? (lSortDir === "desc" ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <th className={`px-4 py-2 text-${align} ${className}`}>
        <button type="button" onClick={() => cycleLSort(k)}
          className={`inline-flex items-center gap-1 ${align === "right" ? "ml-auto" : ""} hover:text-sand transition-colors ${active ? "text-sand" : ""}`}>
          {label}<Icon className={`size-3 ${active ? "opacity-100" : "opacity-40"}`} />
        </button>
      </th>
    );
  }

  type MSortKey = "date" | "placement" | "points";
  const [sortKey, setSortKey] = useState<MSortKey | null>("date");
  const [sortDir, setSortDir] = useState<"desc" | "asc" | null>("desc");
  function cycleSort(k: MSortKey) {
    if (sortKey !== k) { setSortKey(k); setSortDir("desc"); }
    else if (sortDir === "desc") setSortDir("asc");
    else { setSortKey(null); setSortDir(null); }
  }
  const sortedMatches = useMemo(() => {
    if (!sortKey || !sortDir) return filteredMatches;
    const dir = sortDir === "desc" ? -1 : 1;
    const score = (m: MatchRow) => {
      if (sortKey === "date") return m.games ? new Date(m.games.created_at).getTime() : 0;
      if (sortKey === "placement") return m.placement;
      return m.points;
    };
    return [...filteredMatches].sort((a, b) => {
      const av = score(a), bv = score(b);
      return av < bv ? -dir : av > bv ? dir : 0;
    });
  }, [filteredMatches, sortKey, sortDir]);

  const PAGE_SIZE = 100;
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [version, fImmortality, fEpic, fRiseOfIx, fBaseLeaders, sortKey, sortDir]);
  const totalPages = Math.max(1, Math.ceil(sortedMatches.length / PAGE_SIZE));
  const pagedMatches = sortedMatches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  function SortTh({ label, k, className = "" }: { label: string; k: MSortKey; className?: string }) {
    const active = sortKey === k;
    const Icon = active ? (sortDir === "desc" ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <th className={`px-4 py-2 text-left ${className}`}>
        <button type="button" onClick={() => cycleSort(k)}
          className={`inline-flex items-center gap-1 hover:text-sand transition-colors ${active ? "text-sand" : ""}`}>
          {label}<Icon className={`size-3 ${active ? "opacity-100" : "opacity-40"}`} />
        </button>
      </th>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto px-4 py-10 max-w-5xl">
        <div className="flex items-center gap-3 mb-2">
          <UserIcon className="size-7 text-sand" />
          <h1 className="font-display text-3xl flex items-center gap-2">
            {champion && <Trophy className="size-6 text-sand" aria-label="Hall of Fame Champion" />}
            {displayName}
          </h1>
          {claimed ? (
            <span className="inline-flex items-center gap-1 text-xs text-teal border border-teal/40 rounded px-2 py-0.5">
              <BadgeCheck className="size-3" /> Claimed
            </span>
          ) : (
            <Link
              to="/claim"
              search={{ player: playerKey }}
              className="text-xs text-coral underline-offset-2 hover:underline"
            >
              Unclaimed — claim now
            </Link>
          )}
        </div>
        <p className="text-muted-foreground mb-6">Personal stats across all leaderboard versions.</p>

        {tournamentWins > 0 && (
          <Card className="p-4 border-sand/40 bg-gradient-to-br from-card to-card/40 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="size-5 text-sand" />
              <h2 className="font-display text-lg">Tournament wins ({tournamentWins})</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {wins.sort((a, b) => b.tournament_num - a.tournament_num).map((w) => (
                <Link
                  key={w.tournament_num}
                  to="/tournament"
                  className="inline-flex items-center gap-1 text-xs rounded-full border border-sand/40 bg-sand/10 text-sand px-3 py-1 hover:bg-sand/20 transition"
                >
                  <Trophy className="size-3.5" /> Tournament #{w.tournament_num}
                </Link>
              ))}
            </div>
          </Card>
        )}

        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : ratings.length === 0 && matches.length === 0 ? (
          <p className="text-muted-foreground">No data for this player.</p>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
              {GAME_VERSIONS.map((v) => {
                const r = ratings.find((x) => x.game_version === v.value);
                const p = placementStats[v.value];
                return (
                  <Card
                    key={v.value}
                    className={`p-4 border-border/60 bg-card/70 ${v.value === "overall" ? "ring-1 ring-sand/40" : ""}`}
                  >
                    <RatingCard
                      label={v.label}
                      version={v.value}
                      elo={r ? Number(r.elo) : null}
                      rank={ranks[v.value] ?? null}
                      p={p}
                    />

                  </Card>
                );
              })}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-8">
              <QuickJump
                icon={TrendingUp}
                title="ELO History"
                subtitle="Interactive rating graph & match progression"
                target="elo-history"
              />
              <QuickJump
                icon={Trophy}
                title="Achievements & Trophies"
                subtitle="Track lifetime & seasonal milestones"
                target="achievements"
              />
              <QuickJump
                icon={Medal}
                title="Leader Stats"
                subtitle="Pick rate, win rate & points per leader"
                target="leader-stats"
              />
              <QuickJump
                icon={History}
                title="Match History"
                subtitle="Recent game logs, placement & ELO deltas"
                target="match-history"
              />
            </div>

            <EloHistoryChart playerKey={playerKey} />

            {achievements.length > 0 && (
              <section id="achievements" className="mb-8 scroll-mt-24">
                {closingIn.length > 0 && (
                  <div className="mb-6 rounded-lg border border-sand/40 bg-gradient-to-br from-card to-card/40 p-4">
                    <h2 className="font-display text-xl mb-3 flex items-center gap-2">
                      <Target className="size-5 text-sand" /> Closing In
                    </h2>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {closingIn.map((a) => (
                        <AchievementBadge key={a.id} a={a} featured />
                      ))}
                    </div>
                  </div>
                )}
                <h2 className="font-display text-xl mb-3 flex items-center gap-2">
                  <Trophy className="size-5 text-sand" /> Trophy Cabinet
                </h2>

                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <div className="inline-flex rounded-full border border-border/60 bg-card/60 p-0.5">
                    {([
                      { v: "lifetime", label: "\u{1F310} Lifetime" },
                      { v: "seasonal", label: "\u{1F5D3}\uFE0F Current Season" },
                    ] as const).map((s) => (
                      <button
                        key={s.v}
                        type="button"
                        onClick={() => setAchScope(s.v)}
                        className={`rounded-full px-3 py-1 text-xs transition ${
                          achScope === s.v
                            ? "bg-sand text-sand-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <Tabs value={achTab} onValueChange={(v) => setAchTab(v as typeof achTab)}>
                    <TabsList className="bg-card/60 border border-border/60">
                      <TabsTrigger value="all" className="data-[state=active]:bg-sand data-[state=active]:text-sand-foreground text-xs">All Statuses</TabsTrigger>
                      <TabsTrigger value="unlocked" className="data-[state=active]:bg-sand data-[state=active]:text-sand-foreground text-xs">Unlocked</TabsTrigger>
                      <TabsTrigger value="progress" className="data-[state=active]:bg-sand data-[state=active]:text-sand-foreground text-xs">In Progress</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {ACH_TAGS.map((t) => (
                    <button
                      key={t.v}
                      type="button"
                      onClick={() => setAchTag(t.v)}
                      className={`rounded-full border px-3 py-1 text-xs transition ${
                        achTag === t.v
                          ? "border-sand/70 bg-sand/15 text-sand"
                          : "border-border/60 bg-card/60 text-muted-foreground hover:border-sand/40 hover:text-foreground"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {shownAchievements.map((a) => (
                    <AchievementBadge key={a.id} a={a} />
                  ))}
                  {shownAchievements.length === 0 && (
                    <p className="text-muted-foreground text-sm">Nothing here yet.</p>
                  )}
                </div>
              </section>
            )}




            <h2 id="leader-stats" className="font-display text-xl mb-3 flex items-center gap-2 scroll-mt-24">
              <Medal className="size-5 text-sand" /> Leader Stats
            </h2>

            <div className="flex flex-wrap items-center gap-3 mb-3">
              <Tabs value={version} onValueChange={(v) => setVersion(v as GameVersion)}>
                <TabsList className="bg-card/60 border border-border/60">
                  {GAME_VERSIONS.map((v) => (
                    <TabsTrigger key={v.value} value={v.value}
                      className="data-[state=active]:bg-sand data-[state=active]:text-sand-foreground text-xs">
                      {v.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <div className="flex flex-wrap items-center gap-3 p-2 rounded-md border border-border/60 bg-card/40">
                <TriSelect label="Immortality" value={fImmortality} onChange={setFImmortality} />
                {version === "ix" && <TriSelect label="Epic Mode" value={fEpic} onChange={setFEpic} />}
                {version === "uprising" && <TriSelect label="Rise of Ix" value={fRiseOfIx} onChange={setFRiseOfIx} />}
                {version === "uprising" && <TriSelect label="Base Leaders" value={fBaseLeaders} onChange={setFBaseLeaders} />}
              </div>
            </div>
            <Card className="p-0 overflow-hidden mb-8 border-border/60 bg-card/70">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
                    <LSortTh label="Leader" k="leader" align="left" />
                    <LSortTh label="Picks" k="picks" />
                    <LSortTh label="Wins" k="wins" />
                    <LSortTh label="Win %" k="winPct" />
                    <LSortTh label="Avg pts" k="avgPts" />
                  </tr>
                </thead>
                <tbody>
                  {sortedLeaderStats.map((a) => (
                    <tr key={a.leader} className="border-t border-border/40">
                      <td className="px-4 py-2 font-medium">{a.leader}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{a.picks}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{a.wins}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {((a.wins / a.picks) * 100).toFixed(0)}%
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {(a.totalPoints / a.picks).toFixed(1)}
                      </td>
                    </tr>
                  ))}
                  {sortedLeaderStats.length === 0 && (
                    <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No matches recorded.</td></tr>
                  )}
                </tbody>
              </table>
            </Card>

            <h2 id="match-history" className="font-display text-xl mb-3 flex items-center gap-2 scroll-mt-24">
              <History className="size-5 text-sand" /> Match History
            </h2>

            <Card className="p-0 overflow-hidden border-border/60 bg-card/70">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
                    <SortTh label="Date" k="date" />
                    <SortTh label="Placement" k="placement" />
                    <th className="px-4 py-2 text-left">Leader</th>
                    <SortTh label="Points" k="points" />
                    <th className="px-4 py-2 text-left">Version</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {pagedMatches.map((m, i) => (
                    <tr key={i} className="border-t border-border/40 hover:bg-secondary/30">
                      <td className="px-4 py-2 text-muted-foreground">
                        {m.games ? new Date(m.games.created_at).toLocaleDateString() : ""}
                      </td>
                      <td className="px-4 py-2 tabular-nums">{m.placement}</td>
                      <td className="px-4 py-2 font-medium">{m.leader_name ?? "—"}</td>
                      <td className="px-4 py-2 text-sand font-display tabular-nums">{m.points}</td>
                      <td className="px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground">
                        <div className="flex flex-col gap-1 items-start">
                          <span>{m.games?.game_version}</span>
                          {m.games && (
                            <EloDeltaLine
                              version={m.games.game_version as "base" | "ix" | "uprising"}
                              overall={m.elo_delta_overall}
                              versionDelta={m.elo_delta}
                            />
                          )}
                          <TournamentTag num={m.games?.tournament_num ?? null} />
                        </div>
                      </td>
                      <td className="px-2 py-1 text-right">
                        {m.games?.image_url && <ScreenshotButton url={m.games.image_url} />}
                      </td>
                    </tr>
                  ))}
                  {sortedMatches.length === 0 && (
                    <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No matches recorded.</td></tr>
                  )}
                </tbody>
              </table>
              {sortedMatches.length > PAGE_SIZE && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border/40 text-sm">
                  <span className="text-muted-foreground text-xs">
                    Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sortedMatches.length)} of {sortedMatches.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="px-2 py-1 rounded border border-border/60 hover:bg-secondary/40 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Prev
                    </button>
                    <span className="text-xs text-muted-foreground tabular-nums">Page {page} / {totalPages}</span>
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className="px-2 py-1 rounded border border-border/60 hover:bg-secondary/40 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}