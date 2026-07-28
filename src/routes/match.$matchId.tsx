import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Copy, Link as LinkIcon, Trophy, Medal, Award, Maximize2, Loader2, ArrowLeft } from "lucide-react";
import { TournamentTag } from "@/components/EloDelta";
import { usePlayerTitles, colorForKey } from "@/lib/player-title";
import { leaderRouteFor } from "@/lib/leader-slug";
import { useLeaderPortraits } from "@/lib/leader-portraits";

export const Route = createFileRoute("/match/$matchId")({
  head: ({ params }) => ({
    meta: [
      { title: `Match ${params.matchId} · Strategy Arena` },
      { name: "description", content: `Dune Imperium match ${params.matchId} — results, leaders, and scores.` },
      { property: "og:title", content: `Match ${params.matchId}` },
      { property: "og:description", content: `Dune Imperium match ${params.matchId} — results, leaders, and scores.` },
    ],
  }),
  component: MatchDetailsPage,
});

type ResultRow = {
  placement: number;
  player_name: string;
  leader_name: string | null;
  points: number;
  elo_delta: number | null;
  elo_delta_overall: number | null;
};

type RatingTotals = {
  version: number | null;
  overall: number | null;
  vp: number | null;
};

type GameRow = {
  id: string;
  public_match_id: string | null;
  created_at: string;
  game_version: "base" | "ix" | "uprising";
  board_version: string | null;
  has_rise_of_ix: boolean;
  has_epic_mode: boolean;
  has_immortality: boolean;
  has_base_leaders: boolean;
  image_url: string | null;
  tournament_num: number | null;
  game_results: ResultRow[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function MatchDetailsPage() {
  const { matchId } = Route.useParams();
  const [game, setGame] = useState<GameRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFoundState, setNotFoundState] = useState(false);
  const [signedImg, setSignedImg] = useState<string | null>(null);
  const [imgLoading, setImgLoading] = useState(false);
  const [vpDeltas, setVpDeltas] = useState<Record<string, number>>({});
  const [totals, setTotals] = useState<Record<string, RatingTotals>>({});
  const [tourneyTable, setTourneyTable] = useState<{ round: string; table: string } | null>(null);
  const titles = usePlayerTitles();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const select =
        "id, public_match_id, created_at, game_version, board_version, has_rise_of_ix, has_epic_mode, has_immortality, has_base_leaders, image_url, tournament_num, game_results(placement, player_name, leader_name, points, elo_delta, elo_delta_overall)";
      let q = supabase.from("games").select(select).limit(1);
      q = UUID_RE.test(matchId)
        ? q.or(`public_match_id.eq.${matchId},id.eq.${matchId}`)
        : q.eq("public_match_id", matchId);
      const { data } = await q.maybeSingle();
      if (cancelled) return;
      if (!data) {
        setNotFoundState(true);
        setLoading(false);
        return;
      }
      const g = data as GameRow;
      setGame(g);
      setLoading(false);

      // Fetch sandbox VP deltas + current totals for each player.
      const keys = Array.from(new Set(g.game_results.map((r) => r.player_name.toLowerCase().trim())));
      const [{ data: sbrs }, { data: prs }, { data: sbrats }] = await Promise.all([
        supabase
          .from("sandbox_game_results")
          .select("player_name, elo_delta_overall")
          .eq("game_id", g.id),
        supabase
          .from("player_ratings")
          .select("player_key, game_version, elo")
          .in("player_key", keys)
          .in("game_version", [g.game_version, "overall"]),
        supabase
          .from("sandbox_player_ratings")
          .select("player_key, overall_vp_elo")
          .in("player_key", keys),
      ]);
      if (cancelled) return;
      const vmap: Record<string, number> = {};
      (sbrs ?? []).forEach((r) => {
        if (!r.player_name || r.elo_delta_overall === null || r.elo_delta_overall === undefined) return;
        vmap[r.player_name.toLowerCase().trim()] = Number(r.elo_delta_overall);
      });
      setVpDeltas(vmap);
      const tmap: Record<string, RatingTotals> = {};
      keys.forEach((k) => (tmap[k] = { version: null, overall: null, vp: null }));
      (prs ?? []).forEach((r) => {
        if (!r.player_key) return;
        const k = r.player_key.toLowerCase().trim();
        if (!tmap[k]) tmap[k] = { version: null, overall: null, vp: null };
        if (r.game_version === "overall") tmap[k].overall = Number(r.elo);
        else if (r.game_version === g.game_version) tmap[k].version = Number(r.elo);
      });
      (sbrats ?? []).forEach((r) => {
        if (!r.player_key) return;
        const k = r.player_key.toLowerCase().trim();
        if (!tmap[k]) tmap[k] = { version: null, overall: null, vp: null };
        if (r.overall_vp_elo !== null && r.overall_vp_elo !== undefined) tmap[k].vp = Number(r.overall_vp_elo);
      });
      setTotals(tmap);
    })();
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  const leaderSlugs = game
    ? Array.from(
        new Set(
          game.game_results
            .map((r) => (r.leader_name ? leaderRouteFor(r.leader_name) : null))
            .filter((v): v is NonNullable<typeof v> => v !== null)
            .map((v) => v.slug),
        ),
      )
    : [];
  const portraits = useLeaderPortraits(leaderSlugs);

  const openImage = async () => {
    if (!game?.image_url || signedImg) return;
    if (/^https?:\/\//i.test(game.image_url)) {
      setSignedImg(game.image_url);
      return;
    }
    setImgLoading(true);
    const { data } = await supabase.storage
      .from("match-screenshots")
      .createSignedUrl(game.image_url, 60 * 60);
    setSignedImg(data?.signedUrl ?? null);
    setImgLoading(false);
  };

  // Eagerly load the screenshot so we can render a thumbnail preview.
  useEffect(() => {
    if (!game?.image_url || signedImg) return;
    void openImage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.image_url]);

  // Resolve which tournament round/table this game belongs to (for deep-link tag)
  useEffect(() => {
    if (!game || !game.tournament_num) { setTourneyTable(null); return; }
    let cancelled = false;
    void (async () => {
      const names = game.game_results.map((r) => r.player_name);
      const keys = new Set(names.map((n) => n.toLowerCase().trim()));
      const { data } = await supabase
        .from("tournament_matches")
        .select("round_type, table_identifier, player_name")
        .eq("tournament_num", game.tournament_num as number);
      if (cancelled || !data) return;
      const groups = new Map<string, { round: string; table: string; players: Set<string> }>();
      for (const r of data) {
        const k = `${r.round_type}__${r.table_identifier}`;
        const g = groups.get(k) ?? { round: r.round_type, table: r.table_identifier, players: new Set<string>() };
        g.players.add((r.player_name ?? "").toLowerCase().trim());
        groups.set(k, g);
      }
      let best: { round: string; table: string } | null = null;
      for (const g of groups.values()) {
        const matched = [...keys].every((k) => g.players.has(k));
        if (matched && g.players.size === keys.size) { best = { round: g.round, table: g.table }; break; }
      }
      setTourneyTable(best);
    })();
    return () => { cancelled = true; };
  }, [game?.id, game?.tournament_num]);

  const copyLink = async () => {
    if (!game) return;
    const id = game.public_match_id ?? game.id;
    const url = `https://dunestats.cc/match/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Match link copied!");
    } catch {
      toast.error("Could not copy link");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="container mx-auto px-4 py-16 flex justify-center">
          <Loader2 className="size-6 animate-spin text-sand" />
        </div>
      </div>
    );
  }

  if (notFoundState || !game) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="container mx-auto px-4 py-16 text-center">
          <h1 className="font-display text-3xl mb-2">Match not found</h1>
          <p className="text-muted-foreground mb-6">
            No match exists with ID <span className="font-mono">{matchId}</span>.
          </p>
          <Link to="/matches">
            <Button variant="outline"><ArrowLeft className="size-4" /> All matches</Button>
          </Link>
        </div>
      </div>
    );
  }

  const displayId = game.public_match_id ?? game.id;
  const sorted = [...game.game_results].sort((a, b) => a.placement - b.placement);

  const tags: string[] = [];
  if (game.board_version) tags.push(game.board_version === "uprising" ? "Uprising" : "Base");
  if (game.has_rise_of_ix) tags.push("Rise of Ix");
  if (game.has_epic_mode) tags.push("Epic");
  if (game.has_immortality) tags.push("Immortality");
  if (game.has_base_leaders) tags.push("Base Leaders");

  const created = new Date(game.created_at);

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto px-4 py-10 max-w-4xl">
        <Link to="/matches" className="text-sm text-muted-foreground hover:text-sand inline-flex items-center gap-1 mb-4">
          <ArrowLeft className="size-4" /> All matches
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h1 className="font-display text-3xl flex items-center gap-2">
              <LinkIcon className="size-6 text-sand" />
              <span className="font-mono">#{displayId}</span>
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {created.toLocaleString()} · {relativeTime(created)}
            </p>
          </div>
          <Button variant="outline" onClick={copyLink}>
            <Copy className="size-4" /> Copy link
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-6">
          <TournamentTag num={game.tournament_num} round={tourneyTable?.round} table={tourneyTable?.table} />
          {tags.map((t) => (
            <span key={t} className="text-xs px-2 py-0.5 rounded bg-secondary/60 text-secondary-foreground">
              {t}
            </span>
          ))}
        </div>

        <div className="grid gap-6 md:grid-cols-[1fr_auto]">
          <Card className="p-4 border-border/60 bg-card/70">
            <h2 className="font-display text-lg mb-3">Results</h2>
            <div className="space-y-2">
              {sorted.map((r, i) => {
                const leaderRoute = r.leader_name ? leaderRouteFor(r.leader_name) : null;
                const portrait = leaderRoute ? portraits[leaderRoute.slug] : null;
                const key = r.player_name.toLowerCase().trim();
                const t = totals[key];
                const vpDelta = vpDeltas[key];
                return (
                  <div
                    key={i}
                    className="border border-border/40 rounded px-3 py-2 bg-background/40"
                  >
                    <div className="flex items-center gap-3">
                      <PlacementBadge placement={r.placement} />
                      {leaderRoute ? (
                        <Link
                          to="/leaders/$origin/$slug"
                          params={{ origin: leaderRoute.origin, slug: leaderRoute.slug }}
                          className="shrink-0"
                          title={r.leader_name ?? ""}
                        >
                          <div className="size-10 rounded overflow-hidden border border-border/50 bg-card/60">
                            {portrait ? (
                              <img src={portrait} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full" />
                            )}
                          </div>
                        </Link>
                      ) : (
                        <div className="size-10 rounded border border-border/50 bg-card/60" />
                      )}
                      <div className="min-w-0 flex-1">
                        <Link
                          to="/players/$key"
                          params={{ key }}
                          className="block truncate font-medium hover:underline underline-offset-2"
                          style={{ color: colorForKey(titles, r.player_name) }}
                        >
                          {r.player_name}
                        </Link>
                        {leaderRoute ? (
                          <Link
                            to="/leaders/$origin/$slug"
                            params={{ origin: leaderRoute.origin, slug: leaderRoute.slug }}
                            className="block text-xs text-muted-foreground truncate hover:text-sand"
                          >
                            {r.leader_name}
                          </Link>
                        ) : (
                          <div className="text-xs text-muted-foreground truncate">
                            {r.leader_name ?? "—"}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="font-display text-sand text-2xl tabular-nums leading-none">
                          {r.points}
                        </div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">VP</div>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] tabular-nums">
                      <EloTrack label="All" delta={r.elo_delta_overall} total={t?.overall ?? null} />
                      <EloTrack label={versionShort(game.game_version)} delta={r.elo_delta} total={t?.version ?? null} />
                      <EloTrack label="All VP" delta={vpDelta ?? null} total={t?.vp ?? null} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {game.image_url && (
            <Card className="p-3 border-border/60 bg-card/70 w-full md:w-64">
              <h2 className="font-display text-sm mb-2 text-muted-foreground">Screenshot</h2>
              <Dialog onOpenChange={(o) => { if (o) void openImage(); }}>
                <DialogTrigger asChild>
                  <button className="relative group w-full aspect-video rounded overflow-hidden border border-border/50 bg-background/40 flex items-center justify-center">
                    {signedImg ? (
                      <img src={signedImg} alt="Match screenshot preview" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {imgLoading ? <Loader2 className="size-4 animate-spin" /> : "Loading…"}
                      </span>
                    )}
                    <span className="absolute inset-0 flex items-center justify-center bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Maximize2 className="size-5 text-sand" />
                    </span>
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl p-2 bg-background/95 backdrop-blur-md">
                  {imgLoading || !signedImg ? (
                    <div className="flex items-center justify-center h-64 text-muted-foreground">
                      <Loader2 className="size-6 animate-spin" />
                    </div>
                  ) : (
                    <img src={signedImg} alt="Match screenshot" className="w-full h-auto rounded max-h-[80vh] object-contain" />
                  )}
                </DialogContent>
              </Dialog>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function PlacementBadge({ placement }: { placement: number }) {
  const styles: Record<number, { bg: string; icon: React.ReactNode }> = {
    1: { bg: "bg-yellow-500/20 text-yellow-300 border-yellow-500/50", icon: <Trophy className="size-3" /> },
    2: { bg: "bg-zinc-400/20 text-zinc-200 border-zinc-400/50", icon: <Medal className="size-3" /> },
    3: { bg: "bg-orange-600/20 text-orange-300 border-orange-600/50", icon: <Award className="size-3" /> },
  };
  const s = styles[placement] ?? { bg: "bg-secondary/60 text-secondary-foreground border-border/60", icon: null };
  return (
    <span className={`inline-flex items-center gap-1 border rounded-md px-2 py-1 font-display text-sm w-14 justify-center ${s.bg}`}>
      {s.icon}
      {placement}
    </span>
  );
}

function versionShort(v: "base" | "ix" | "uprising"): string {
  return v === "base" ? "BA" : v === "ix" ? "IX" : "UP";
}

function fmtDelta(n: number | null | undefined): string | null {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return null;
  const v = Number(n);
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
}

function EloTrack({
  label,
  delta,
  total,
}: {
  label: string;
  delta: number | null | undefined;
  total: number | null | undefined;
}) {
  const d = fmtDelta(delta);
  const tone = delta === null || delta === undefined
    ? "text-muted-foreground"
    : Number(delta) > 0
      ? "text-emerald-400"
      : Number(delta) < 0
        ? "text-red-400"
        : "text-muted-foreground";
  return (
    <Link
      to="/leaderboard"
      className="rounded border border-border/40 bg-background/40 px-2 py-1 hover:border-sand/60 hover:bg-sand/5 transition-colors"
      title="View leaderboard"
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="font-display text-sand text-sm">
          {total !== null && total !== undefined ? Math.round(Number(total)) : "—"}
        </span>
        {d && <span className={`text-[11px] ${tone}`}>({d})</span>}
      </div>
    </Link>
  );
}

function relativeTime(d: Date): string {
  const diff = Date.now() - d.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

// keep notFound import usage happy for tree-shaking check
void notFound;
