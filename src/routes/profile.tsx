import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { User as UserIcon, UserPlus, BadgeCheck, Trophy } from "lucide-react";
import { loadChampions, type ChampionMap } from "@/lib/champions";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "My profile · Strategy Arena" }] }),
  component: ProfileLanding,
});

type Claim = { player_key: string; display_name: string; game_version: string; elo: number; games_played: number };

function ProfileLanding() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [champions, setChampions] = useState<ChampionMap>(new Map());

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const uid = data.session?.user.id ?? null;
      if (!uid) {
        navigate({ to: "/auth", search: { next: "/profile" } });
        return;
      }
      setUserId(uid);
      const { data: rows } = await supabase
        .from("player_ratings")
        .select("player_key, display_name, game_version, elo, games_played")
        .eq("claimed_by", uid);
      setClaims((rows as Claim[]) ?? []);
      setChecking(false);
    });
  }, [navigate]);

  useEffect(() => {
    void loadChampions().then((m) => setChampions(new Map(m)));
  }, []);

  if (checking) return null;

  // Unique by player_key
  const seen = new Set<string>();
  const unique = claims.filter((c) => {
    if (seen.has(c.player_key)) return false;
    seen.add(c.player_key);
    return true;
  });

  // Aggregate this user's tournament wins from the champions map.
  const myWins: { tournament_num: number; player: string }[] = [];
  for (const c of unique) {
    const wins = champions.get(c.player_key) ?? [];
    for (const w of wins) myWins.push({ tournament_num: w.tournament_num, player: c.display_name });
  }
  myWins.sort((a, b) => b.tournament_num - a.tournament_num);
  const totalWins = myWins.length;

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto px-4 py-10 max-w-3xl">
        <div className="flex items-center gap-3 mb-2">
          <UserIcon className="size-7 text-sand" />
          <h1 className="font-display text-3xl flex items-center gap-2">
            {totalWins >= 3 && <Trophy className="size-6 text-sand" aria-label="Hall of Fame Champion" />}
            My profile
          </h1>
        </div>
        <p className="text-muted-foreground mb-6">
          {userId ? "Your claimed in-game names appear below." : ""}
        </p>

        {myWins.length > 0 && (
          <Card className="p-5 border-sand/40 bg-gradient-to-br from-card to-card/40 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="size-5 text-sand" />
              <h2 className="font-display text-lg">Tournament wins ({totalWins})</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {myWins.map((w) => (
                <Link
                  key={`${w.tournament_num}-${w.player}`}
                  to="/tournament"
                  className="inline-flex items-center gap-1 text-xs rounded-full border border-sand/40 bg-sand/10 text-sand px-3 py-1 hover:bg-sand/20 transition"
                >
                  <Trophy className="size-3.5" /> Tournament #{w.tournament_num}
                </Link>
              ))}
            </div>
          </Card>
        )}

        {unique.length === 0 ? (
          <Card className="p-6 border-border/60 bg-card/70 text-center">
            <p className="text-muted-foreground mb-4">
              You haven't claimed any in-game name yet.
            </p>
            <Button asChild>
              <Link to="/claim">
                <UserPlus className="size-4" /> Claim your name
              </Link>
            </Button>
          </Card>
        ) : (
          <div className="grid gap-3">
            {unique.map((c) => (
              <Link
                key={c.player_key}
                to="/players/$key"
                params={{ key: c.player_key }}
                className="block"
              >
                <Card className="p-4 border-border/60 bg-card/70 hover:border-sand transition-colors flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <BadgeCheck className="size-5 text-teal" />
                    <div>
                      <div className="font-medium">{c.display_name}</div>
                      <div className="text-xs text-muted-foreground">View personal stats</div>
                    </div>
                  </div>
                  <span className="text-sm text-sand">→</span>
                </Card>
              </Link>
            ))}
            <div className="text-center mt-4">
              <Button asChild variant="outline" size="sm">
                <Link to="/claim">
                  <UserPlus className="size-4" /> Claim another name
                </Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}