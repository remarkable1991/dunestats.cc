import { createFileRoute, Link } from "@tanstack/react-router";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Trophy, Upload, BarChart3, Sparkles, Medal } from "lucide-react";
import discordBanner from "@/assets/discord-banner.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Strategy Arena — Dune Imperium ELO" },
      { name: "description", content: "Upload screenshots, climb the leaderboard." },
    ],
  }),
  component: Index,
});

const CARDS = [
  {
    to: "/tournament",
    icon: Trophy,
    title: "Tournaments Arena",
    text: "Explore upcoming championships, view live active brackets, and revisit the historic halls of past tournament glories.",
  },
  {
    to: "/stats",
    icon: BarChart3,
    title: "Leader Insights & Analytics",
    text: "Decode the meta. Analyze real-time pick frequencies, win ratios, and execution metrics across all game expansions.",
  },
  {
    to: "/leaderboard",
    icon: Trophy,
    title: "Global Player Standings",
    text: "Track your personal ELO progression, compare competitive win rates, and see who commands the top of the leaderboard.",
  },
  {
    to: "/upload",
    icon: Upload,
    title: "Automated Match Scan",
    text: "Drop your end-game screenshot. Our computer-vision pipeline instantly extracts table points, placements, and leader lineups.",
  },
] as const;

function Index() {
  const [stats, setStats] = useState<{ games: number | null; players: number | null; tournaments: number | null }>({
    games: null,
    players: null,
    tournaments: null,
  });

  useEffect(() => {
    (async () => {
      const [g, p] = await Promise.all([
        supabase.from("games").select("*", { count: "exact", head: true }),
        supabase.from("player_ratings").select("player_key", { count: "exact", head: true }).eq("game_version", "overall"),
      ]);
      const { data: tids } = await supabase.from("tournament_matches").select("tournament_num");
      const tournamentsCount = tids ? new Set(tids.map((r) => r.tournament_num)).size : 0;
      setStats({ games: g.count ?? 0, players: p.count ?? 0, tournaments: tournamentsCount });
    })();
  }, []);

  return (
    <div className="min-h-screen">
      <Navbar />

      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(60% 50% at 50% 0%, oklch(0.76 0.14 70 / 0.35), transparent 70%)",
          }}
        />
        <div className="container relative mx-auto px-4 py-12 sm:py-16 space-y-10">
          <div className="text-center space-y-4 max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 rounded-full border border-sand/40 bg-sand/10 px-3 py-1 text-xs uppercase tracking-widest text-sand">
              <Sparkles className="size-3.5" /> Dune Imperium Digital
            </div>
            <h1 className="font-display text-4xl sm:text-5xl font-bold leading-tight">
              The community ELO arena for <span className="text-gradient-sand">Dune Imperium</span>
            </h1>
          </div>

          {/* 4-card dashboard */}
          <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
            {CARDS.map(({ to, icon: Icon, title, text }) => (
              <Link
                key={to}
                to={to}
                className="group rounded-xl border border-border/60 bg-card/70 backdrop-blur p-6 shadow-arena transition-all hover:border-sand/60 hover:bg-card/90 hover:-translate-y-0.5"
              >
                <div className="flex items-start gap-4">
                  <div className="shrink-0 rounded-lg border border-sand/30 bg-sand/10 p-3 text-sand transition-colors group-hover:bg-sand/20">
                    <Icon className="size-6" />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <h2 className="font-display text-xl font-bold text-foreground">{title}</h2>
                    <p className="text-sm text-muted-foreground leading-relaxed">{text}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-xl border border-border/60 bg-card/60 backdrop-blur p-6">
            {[
              { label: "Total Games Logged", value: stats.games },
              { label: "Active Competitors", value: stats.players },
              { label: "Tournaments Hosted", value: stats.tournaments },
            ].map((b) => (
              <div key={b.label} className="text-center">
                <div className="font-display text-3xl sm:text-4xl font-bold text-sand tabular-nums">
                  {b.value === null ? "—" : b.value.toLocaleString()}
                </div>
                <div className="mt-1 text-[11px] uppercase tracking-widest text-muted-foreground">{b.label}</div>
              </div>
            ))}
          </div>

          {/* Discord banner */}
          <a
            href="https://discord.gg/U96V93ZS3C"
            target="_blank"
            rel="noopener noreferrer"
            className="block overflow-hidden rounded-xl border border-border/60 transition-transform hover:scale-[1.01]"
          >
            <img src={discordBanner.url} alt="Join our Discord community" className="w-full h-auto block" />
          </a>
        </div>
      </section>

      <footer className="border-t border-border/40 py-6 text-center text-xs text-muted-foreground">
        Strategy Arena · Where great minds compete · Fan-made tracker, not affiliated with Dire Wolf Digital.
      </footer>
    </div>
  );
}
