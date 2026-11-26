import { createFileRoute, Link } from "@tanstack/react-router";
import { Navbar } from "@/components/Navbar";
import { useEffect, useState } from "react";
import { Trophy, Upload, BarChart3, Sparkles, Medal, LineChart as LineChartIcon } from "lucide-react";
import discordBanner from "@/assets/discord-banner.png.asset.json";
import { TournamentCountdown } from "@/components/TournamentCountdown";
import { CheckinBanner } from "@/components/CheckinBanner";
import { fetchHomeStats, type HomeStats } from "@/lib/home-stats";
import { HomeTrendPanel } from "@/components/HomeTrendPanel";
import type { TrendMetric } from "@/lib/home-trends";
import { Fragment } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Strategy Arena — Dune Imperium ELO" },
      { name: "description", content: "Where great minds compete. Dune Imperium tournaments, stats and leaderboards all in one place!" },
      { property: "og:title", content: "Strategy Arena — Dune Imperium ELO" },
      { property: "og:description", content: "Dune Imperium tournaments, player stats and competitive leaderboards." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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
    icon: Medal,
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
  const [stats, setStats] = useState<HomeStats | null>(null);
  const [open, setOpen] = useState<{ metric: TrendMetric; label: string } | null>(null);

  useEffect(() => {
    let active = true;
    fetchHomeStats()
      .then((next) => {
        if (active) setStats(next);
      })
      .catch((error) => console.error("Failed to load home page stats", error));
    return () => {
      active = false;
    };
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

          {/* Eight metrics stay balanced at two columns on mobile and four on desktop. */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-5 rounded-xl border border-border/60 bg-card/60 backdrop-blur p-5 sm:p-6">
            {([
              { label: "Total Games Logged", value: stats?.games, metric: "games" },
              { label: "Games Logged This Week", value: stats?.weekGames, metric: "games" },
              { label: "Active Competitors", value: stats?.players, metric: "players" },
              { label: "Tournaments Hosted", value: stats?.tournaments, metric: "tournaments" },
              { label: "League Games Played", value: stats?.leagueGames, metric: "leagueGames" },
              { label: "League Competitors", value: stats?.leaguePlayers, metric: "leaguePlayers" },
              { label: "Lobbies Hosted", value: stats?.lobbies, metric: "lobbies" },
              { label: "Lobbies This Week", value: stats?.weekLobbies, metric: "lobbies" },
            ] as const).map((b, i, arr) => {
              const selected = open?.label === b.label;
              // Panel opens below the row containing the clicked card (2 per row mobile, 4 desktop).
              const openIdx = open ? arr.findIndex((x) => x.label === open.label) : -1;
              const endMobile = openIdx >= 0 && (i === openIdx + (openIdx % 2 === 0 ? 1 : 0));
              const endDesktop = openIdx >= 0 && i === Math.floor(openIdx / 4) * 4 + 3;
              return (
                <Fragment key={b.label}>
                  <button
                    type="button"
                    onClick={() => setOpen(selected ? null : { metric: b.metric, label: b.label })}
                    aria-expanded={selected}
                    className={`group relative rounded-lg py-2 text-center transition-colors hover:bg-sand/10 ${selected ? "bg-sand/10 ring-1 ring-sand/40" : ""}`}
                  >
                    <LineChartIcon className="absolute right-2 top-2 size-3.5 text-sand opacity-40 transition-opacity group-hover:opacity-100" />
                    <div className="font-display text-3xl sm:text-4xl font-bold text-sand tabular-nums">
                      {b.value == null ? "—" : b.value.toLocaleString()}
                    </div>
                    <div className="mt-1 text-[11px] uppercase tracking-widest text-muted-foreground">{b.label}</div>
                  </button>
                  {open && endMobile && (
                    <div className="col-span-2 md:hidden"><HomeTrendPanel metric={open.metric} onClose={() => setOpen(null)} /></div>
                  )}
                  {open && endDesktop && (
                    <div className="hidden md:block md:col-span-4"><HomeTrendPanel metric={open.metric} onClose={() => setOpen(null)} /></div>
                  )}
                </Fragment>
              );
            })}
          </div>

          {/* Check-in phase banner */}
          <CheckinBanner />

          {/* Upcoming tournament countdown banner */}
          <TournamentCountdown />

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

    </div>
  );
}
