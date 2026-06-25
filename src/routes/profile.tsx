import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { User as UserIcon, UserPlus, BadgeCheck } from "lucide-react";

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

  if (checking) return null;

  // Unique by player_key
  const seen = new Set<string>();
  const unique = claims.filter((c) => {
    if (seen.has(c.player_key)) return false;
    seen.add(c.player_key);
    return true;
  });

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto px-4 py-10 max-w-3xl">
        <div className="flex items-center gap-3 mb-2">
          <UserIcon className="size-7 text-sand" />
          <h1 className="font-display text-3xl">My profile</h1>
        </div>
        <p className="text-muted-foreground mb-6">
          {userId ? "Your claimed in-game names appear below." : ""}
        </p>

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