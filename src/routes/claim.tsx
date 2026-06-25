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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

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
  elo: number;
  games_played: number;
  wins: number;
};

function ClaimPage() {
  const navigate = useNavigate();
  const { player } = useSearch({ from: "/claim" });
  const [checking, setChecking] = useState(true);
  const [query, setQuery] = useState(player ?? "");
  const [matches, setMatches] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [hasUsedReset, setHasUsedReset] = useState<boolean | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        navigate({
          to: "/auth",
          search: { next: "/claim", ...(player ? { player } : {}) },
        });
      } else {
        setChecking(false);
        void supabase
          .from("profiles")
          .select("has_used_reset")
          .eq("id", data.session.user.id)
          .maybeSingle()
          .then(({ data: p }) => setHasUsedReset(Boolean(p?.has_used_reset)));
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
      .select("player_key, display_name, game_version, claimed_by, elo, games_played, wins")
      .ilike("display_name", `%${needle}%`)
      .limit(50)
      .then(({ data }) => {
        if (cancelled) return;
        // Group by player_key, keep entry with most games_played as representative.
        const byKey = new Map<string, Suggestion>();
        for (const r of (data as Suggestion[]) ?? []) {
          const prev = byKey.get(r.player_key);
          if (!prev || r.games_played > prev.games_played) byKey.set(r.player_key, r);
        }
        setMatches(Array.from(byKey.values()));
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const doClaim = async (player_key: string, reset: boolean) => {
    setBusy(player_key);
    try {
      await claimPlayer({ data: { player_key, reset } });
      toast.success(
        reset
          ? "Name claimed with a fresh start. Old matches kept as shadow data."
          : "Name claimed! Your existing stats stay.",
      );
      navigate({ to: "/leaderboard" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not claim name.");
    } finally {
      setBusy(null);
      setConfirmKey(null);
    }
  };

  const handleClaim = (m: Suggestion) => {
    const hasStats = m.games_played > 0;
    // First claim ever AND has stats → offer the reset choice.
    if (hasStats && hasUsedReset === false) {
      setConfirmKey(m.player_key);
    } else {
      void doClaim(m.player_key, false);
    }
  };

  const confirmMatch = matches.find((m) => m.player_key === confirmKey) ?? null;

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
                    onClick={() => handleClaim(m)}
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

      <Dialog open={confirmKey !== null} onOpenChange={(o) => !o && setConfirmKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Keep stats or start fresh?</DialogTitle>
            <DialogDescription>
              This is your one-time stats reset. After claiming you can't reset again on this account.
            </DialogDescription>
          </DialogHeader>
          {confirmMatch && (
            <div className="rounded-md border border-border/60 bg-background/40 p-3 text-sm">
              <div className="font-medium">{confirmMatch.display_name}</div>
              <div className="text-muted-foreground mt-1">
                ELO <span className="text-sand tabular-nums">{Number(confirmMatch.elo).toFixed(0)}</span> ·
                Games <span className="tabular-nums">{confirmMatch.games_played}</span> ·
                Wins <span className="tabular-nums">{confirmMatch.wins}</span>
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Either way, the original match history stays in the database as shadow data.
          </p>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => confirmKey && doClaim(confirmKey, true)}
              disabled={busy !== null}
            >
              Start fresh (1000 ELO)
            </Button>
            <Button
              onClick={() => confirmKey && doClaim(confirmKey, false)}
              disabled={busy !== null}
            >
              Keep current stats
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}