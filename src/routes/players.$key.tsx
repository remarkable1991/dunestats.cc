import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { GAME_VERSIONS, type GameVersion } from "@/lib/game-version";
import { User as UserIcon, BadgeCheck, Trophy, Medal } from "lucide-react";

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
  } | null;
};

function ProfilePage() {
  const { key } = Route.useParams();
  const playerKey = decodeURIComponent(key).toLowerCase().trim();
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      supabase
        .from("player_ratings")
        .select("player_key, display_name, game_version, elo, games_played, wins, top2, total_points, claimed_by")
        .eq("player_key", playerKey),
      supabase
        .from("game_results")
        .select("placement, player_name, leader_name, points, games!inner(id, created_at, game_version, board_version)")
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

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto px-4 py-10 max-w-5xl">
        <div className="flex items-center gap-3 mb-2">
          <UserIcon className="size-7 text-sand" />
          <h1 className="font-display text-3xl">{displayName}</h1>
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

        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : ratings.length === 0 && matches.length === 0 ? (
          <p className="text-muted-foreground">No data for this player.</p>
        ) : (
          <>
            <div className="grid sm:grid-cols-3 gap-3 mb-8">
              {GAME_VERSIONS.map((v) => {
                const r = ratings.find((x) => x.game_version === v.value);
                return (
                  <Card key={v.value} className="p-4 border-border/60 bg-card/70">
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
            <div className="space-y-2">
              {matches.map((m, i) => (
                <Card key={i} className="p-3 border-border/60 bg-card/60 flex flex-wrap items-center gap-3">
                  <span className="inline-flex size-7 items-center justify-center rounded font-bold bg-secondary/60">
                    {m.placement}
                  </span>
                  <span className="font-medium">{m.leader_name ?? "—"}</span>
                  <span className="text-sand font-display tabular-nums">{m.points} pts</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {m.games ? new Date(m.games.created_at).toLocaleDateString() : ""} ·{" "}
                    {m.games?.game_version}
                  </span>
                </Card>
              ))}
              {matches.length === 0 && (
                <p className="text-muted-foreground text-sm">No matches recorded.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}