import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { GAME_VERSIONS, type GameVersion } from "@/lib/game-version";
import { User as UserIcon, BadgeCheck, Trophy, Medal, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { ScreenshotButton } from "@/components/ScreenshotButton";
import { useChampions, isChampion, winCount } from "@/lib/champions";

export const Route = createFileRoute("/players/$key")({
  head: ({ params }) => ({
    meta: [{ title: `${params.key} · Player profile` }],
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
  games: {
    id: string;
    created_at: string;
    game_version: GameVersion;
    board_version: string | null;
    image_url: string | null;
  } | null;
};

function ProfilePage() {
  const { key } = Route.useParams();
  const playerKey = decodeURIComponent(key).toLowerCase().trim();
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
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
        .select("placement, player_name, leader_name, points, games!inner(id, created_at, game_version, board_version, image_url)")
        .ilike("player_name", playerKey)
        .order("created_at", { foreignTable: "games", ascending: false })
        .limit(100),
    ]).then(([r, m]) => {
      setRatings((r.data as Rating[]) ?? []);
      setMatches((m.data as unknown as MatchRow[]) ?? []);
      setLoading(false);
    });
  }, [playerKey]);

  const displayName = ratings[0]?.display_name ?? playerKey;
  const claimed = ratings.some((r) => r.claimed_by);

  const leaderStats = useMemo(() => {
    const map = new Map<string, { leader: string; picks: number; wins: number; totalPoints: number }>();
    for (const m of matches) {
      const lead = m.leader_name?.trim() || "Unknown";
      const a = map.get(lead) ?? { leader: lead, picks: 0, wins: 0, totalPoints: 0 };
      a.picks += 1;
      if (m.placement === 1) a.wins += 1;
      a.totalPoints += m.points;
      map.set(lead, a);
    }
    return Array.from(map.values()).sort((a, b) => b.picks - a.picks);
  }, [matches]);

  type MSortKey = "date" | "placement" | "points";
  const [sortKey, setSortKey] = useState<MSortKey | null>("date");
  const [sortDir, setSortDir] = useState<"desc" | "asc" | null>("desc");
  function cycleSort(k: MSortKey) {
    if (sortKey !== k) { setSortKey(k); setSortDir("desc"); }
    else if (sortDir === "desc") setSortDir("asc");
    else { setSortKey(null); setSortDir(null); }
  }
  const sortedMatches = useMemo(() => {
    if (!sortKey || !sortDir) return matches;
    const dir = sortDir === "desc" ? -1 : 1;
    const score = (m: MatchRow) => {
      if (sortKey === "date") return m.games ? new Date(m.games.created_at).getTime() : 0;
      if (sortKey === "placement") return m.placement;
      return m.points;
    };
    return [...matches].sort((a, b) => {
      const av = score(a), bv = score(b);
      return av < bv ? dir : av > bv ? -dir : 0;
    });
  }, [matches, sortKey, sortDir]);
  function SortTh({ label, k, className = "" }: { label: string; k: MSortKey; className?: string }) {
    const active = sortKey === k;
    const Icon = active ? (sortDir === "desc" ? ArrowDown : ArrowUp) : ArrowUpDown;
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
                return (
                  <Card
                    key={v.value}
                    className={`p-4 border-border/60 bg-card/70 ${v.value === "overall" ? "ring-1 ring-sand/40" : ""}`}
                  >
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">{v.label}</div>
                    <div className="font-display text-3xl text-sand mt-1">
                      {r ? Math.round(Number(r.elo)) : "—"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {r ? `${r.wins}W · ${r.games_played} games · ${r.top2} top-2` : "No games yet"}
                    </div>
                  </Card>
                );
              })}
            </div>

            <h2 className="font-display text-xl mb-3 flex items-center gap-2">
              <Medal className="size-5 text-sand" /> Leaders played
            </h2>
            <Card className="p-0 overflow-hidden mb-8 border-border/60 bg-card/70">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2 text-left">Leader</th>
                    <th className="px-4 py-2 text-right">Picks</th>
                    <th className="px-4 py-2 text-right">Wins</th>
                    <th className="px-4 py-2 text-right">Win %</th>
                    <th className="px-4 py-2 text-right">Avg pts</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderStats.map((a) => (
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
                  {leaderStats.length === 0 && (
                    <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No matches recorded.</td></tr>
                  )}
                </tbody>
              </table>
            </Card>

            <h2 className="font-display text-xl mb-3 flex items-center gap-2">
              <Trophy className="size-5 text-sand" /> Recent matches
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
                  {sortedMatches.map((m, i) => (
                    <tr key={i} className="border-t border-border/40 hover:bg-secondary/30">
                      <td className="px-4 py-2 text-muted-foreground">
                        {m.games ? new Date(m.games.created_at).toLocaleDateString() : ""}
                      </td>
                      <td className="px-4 py-2 tabular-nums">{m.placement}</td>
                      <td className="px-4 py-2 font-medium">{m.leader_name ?? "—"}</td>
                      <td className="px-4 py-2 text-sand font-display tabular-nums">{m.points}</td>
                      <td className="px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground">
                        {m.games?.game_version}
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
            </Card>
          </>
        )}
      </div>
    </div>
  );
}