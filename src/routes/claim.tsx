import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { claimPlayer } from "@/lib/games.functions";
import { toast } from "sonner";
import { BadgeCheck, Loader2, UserCheck, Search } from "lucide-react";

export const Route = createFileRoute("/claim")({
  head: () => ({ meta: [{ title: "Claim your name · Strategy Arena" }] }),
  validateSearch: z.object({ player: z.string().optional() }),
  component: ClaimPage,
});

type Suggestion = {
  player_key: string;
  display_name: string;
  game_version: string;
  claimed_by: string | null;
};

function ClaimPage() {
  const navigate = useNavigate();
  const { player } = useSearch({ from: "/claim" });
  const [checking, setChecking] = useState(true);
  const [query, setQuery] = useState(player ?? "");
  const [matches, setMatches] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        navigate({
          to: "/auth",
          search: { next: "/claim", ...(player ? { player } : {}) },
        });
      } else {
        setChecking(false);
      }
    });
  }, [navigate, player]);

  useEffect(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      setMatches([]);
      return;
    }
    let cancelled = false;
    void supabase
      .from("player_ratings")
      .select("player_key, display_name, game_version, claimed_by")
      .ilike("display_name", `%${needle}%`)
      .limit(50)
      .then(({ data }) => {
        if (cancelled) return;
        const seen = new Set<string>();
        const list: Suggestion[] = [];
        for (const r of (data as Suggestion[]) ?? []) {
          if (seen.has(r.player_key)) continue;
          seen.add(r.player_key);
          list.push(r);
        }
        setMatches(list);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const handleClaim = async (player_key: string) => {
    setBusy(player_key);
    try {
      await claimPlayer({ data: { player_key } });
      toast.success("Name claimed! It now shows on your leaderboard entry.");
      navigate({ to: "/leaderboard" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not claim name.");
    } finally {
      setBusy(null);
    }
  };

  if (checking) return null;

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <div className="flex items-center gap-3 mb-2">
          <UserCheck className="size-7 text-sand" />
          <h1 className="font-display text-3xl">Claim your player name</h1>
        </div>
        <p className="text-muted-foreground mb-6">
          Find the in-game name you use in Dune Imperium Digital and claim it to link your leaderboard entry to your
          account. Each name can only be claimed once.
        </p>

        <Card className="p-6 border-border/60 bg-card/70 shadow-arena">
          <Label htmlFor="q">Search players</Label>
          <div className="relative mt-1">
            <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
            <Input
              id="q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Start typing your in-game name…"
              className="pl-8"
              autoFocus
            />
          </div>

          <div className="mt-5 space-y-2 max-h-[60vh] overflow-y-auto">
            {query.trim() === "" && (
              <p className="text-sm text-muted-foreground text-center py-8">
                Type your name above to find matching leaderboard entries.
              </p>
            )}
            {query.trim() !== "" && matches.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No players found. Upload a match first — every detected name lands on the leaderboard automatically.
              </p>
            )}
            {matches.map((m) => (
              <div
                key={m.player_key + m.game_version}
                className="flex items-center justify-between border border-border/50 rounded-md px-3 py-2 bg-background/40"
              >
                <div>
                  <div className="font-medium">{m.display_name}</div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">{m.game_version}</div>
                </div>
                {m.claimed_by ? (
                  <span className="inline-flex items-center gap-1 text-xs text-teal">
                    <BadgeCheck className="size-3.5" /> Claimed
                  </span>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => handleClaim(m.player_key)}
                    disabled={busy !== null}
                  >
                    {busy === m.player_key ? (
                      <>
                        <Loader2 className="size-3 animate-spin" /> Claiming…
                      </>
                    ) : (
                      "Claim"
                    )}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Card>

        <p className="text-xs text-muted-foreground mt-4 text-center">
          Looking for a name that isn't here?{" "}
          <Link to="/upload" className="text-sand hover:underline">
            Upload a match
          </Link>{" "}
          first.
        </p>
      </div>
    </div>
  );
}