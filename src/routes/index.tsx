import { createFileRoute, Link } from "@tanstack/react-router";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, Trophy, Sparkles, BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import logoAsset from "@/assets/logo.png.asset.json";
import { GAME_VERSIONS, EXPANSION_VERSIONS, versionLabel, type GameVersion } from "@/lib/game-version";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Strategy Arena — Dune Imperium ELO" },
      { name: "description", content: "Upload screenshots, climb the leaderboard." },
    ],
  }),
  component: Index,
});

type TopRow = { display_name: string; elo: number; games_played: number; game_version: string };

function Index() {
  const [tops, setTops] = useState<Record<string, TopRow[]>>({});

  useEffect(() => {
    (async () => {
      const out: Record<string, TopRow[]> = {};
      for (const v of GAME_VERSIONS) {
        const { data } = await supabase
          .from("player_ratings")
          .select("display_name, elo, games_played, game_version")
          .eq("game_version", v.value)
          .gte("games_played", 3)
          .order("elo", { ascending: false })
          .limit(5);
        out[v.value] = (data as TopRow[]) ?? [];
      }
      setTops(out);
    })();
  }, []);

  return (
    <div className="min-h-screen">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(60% 50% at 50% 0%, oklch(0.76 0.14 70 / 0.35), transparent 70%)",
          }}
        />
        <div className="container relative mx-auto px-4 py-16 sm:py-24 grid lg:grid-cols-[1.2fr_1fr] gap-12 items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-sand/40 bg-sand/10 px-3 py-1 text-xs uppercase tracking-widest text-sand">
              <Sparkles className="size-3.5" /> Dune Imperium Digital
            </div>
            <h1 className="font-display text-4xl sm:text-6xl font-bold leading-tight">
              The community ELO arena for{" "}
              <span className="text-gradient-sand">Dune Imperium</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl">
              Upload your end-of-match screenshot. Our AI reads the placements, leaders, and points — then updates the
              global leaderboard across Base Game, Rise of Ix, and Uprising.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/upload">
                  <Upload className="size-4" /> Upload a match
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/leaderboard">
                  <Trophy className="size-4" /> View leaderboard
                </Link>
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-4 max-w-md pt-4">
              {EXPANSION_VERSIONS.map((v) => (
                <div key={v.value} className="rounded-lg border border-border/60 bg-card/60 p-3 text-center">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{v.label}</div>
                  <div className="font-display text-lg text-sand">{tops[v.value]?.[0]?.display_name ?? "—"}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative flex justify-center">
            <div className="absolute inset-0 blur-3xl opacity-40 bg-[radial-gradient(circle,oklch(0.66_0.20_25/0.5),transparent_60%)]" />
            <img
              src={logoAsset.url}
              alt="Strategy Arena"
              className="relative w-[320px] sm:w-[420px] drop-shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
            />
          </div>
        </div>
      </section>

      {/* Top players preview */}
      <section className="container mx-auto px-4 pb-20">
        <div className="flex items-end justify-between mb-6">
          <h2 className="font-display text-2xl sm:text-3xl">Top players right now</h2>
          <Link to="/leaderboard" className="text-sm text-sand hover:underline">
            Full leaderboard →
          </Link>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {GAME_VERSIONS.map((v) => (
            <Card key={v.value} className="p-5 border-border/60 bg-card/70 backdrop-blur shadow-arena">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-lg">{v.label}</h3>
                <BarChart3 className="size-4 text-sand" />
              </div>
              <ol className="space-y-2">
                {(tops[v.value] ?? []).map((r, i) => (
                  <li key={r.display_name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-3">
                      <span
                        className={`inline-flex size-6 items-center justify-center rounded text-[11px] font-bold ${
                          i === 0 ? "bg-sand text-sand-foreground" : i === 1 ? "bg-teal/80 text-background" : i === 2 ? "bg-coral/80 text-white" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <span className="font-medium">{r.display_name}</span>
                    </span>
                    <span className="tabular-nums text-sand font-semibold">{Math.round(Number(r.elo))}</span>
                  </li>
                ))}
                {(tops[v.value]?.length ?? 0) === 0 && (
                  <li className="text-sm text-muted-foreground">No qualifying players yet.</li>
                )}
              </ol>
            </Card>
          ))}
        </div>
      </section>

      <footer className="border-t border-border/40 py-6 text-center text-xs text-muted-foreground">
        Strategy Arena · Where great minds compete · Fan-made tracker, not affiliated with Dire Wolf Digital.
      </footer>
    </div>
  );
}

// silence unused
void versionLabel;
void ({} as GameVersion);
