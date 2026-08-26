import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { SupabaseImage } from "@/components/SupabaseImage";
import { signedUrlOrR2, mirrorFileToR2 } from "@/lib/storage-r2";
import { useCallback, useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Copy, Link as LinkIcon, Trophy, Medal, Award, Maximize2, Loader2, ArrowLeft, Pencil, Swords, ShieldCheck } from "lucide-react";
import { TournamentTag } from "@/components/EloDelta";
import { usePlayerTitles, colorForKey } from "@/lib/player-title";
import { leaderRouteFor } from "@/lib/leader-slug";
import { useLeaderPortraits } from "@/lib/leader-portraits";
import { applyFirstPlayer, type TelemetryPlayer } from "@/lib/match-telemetry";
import { runMatchTelemetry } from "@/lib/match-telemetry.functions";
import {
  AgentRow,
  HighCouncilSeats,
  ResourceBadges,
  SwordmasterSpace,
  WurmToken,
} from "@/components/MatchBoardOverlay";


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
  spice: number | null;
  solaris: number | null;
  water: number | null;
  is_leaver: boolean | null;
  player_slot: number | null;
  turn_order: number | null;
  player_color: "Green" | "Yellow" | "Red" | "Blue" | string | null;
  has_first_player: boolean | null;
  has_high_council: boolean | null;
  has_swordmaster: boolean | null;
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
  end_round: number | null;
  image_url: string | null;
  tournament_num: number | null;
  conflict_title: string | null;
  ai_scan_status: "Yes" | "No" | "Issue detected" | string | null;
  ai_scan_summary: string | null;
  game_results: ResultRow[];
};

const PLAYER_COLORS: Record<string, string> = {
  green: "#22c55e",
  yellow: "#eab308",
  red: "#ef4444",
  blue: "#3b82f6",
};

function colorHex(c: string | null | undefined): string {
  return PLAYER_COLORS[(c ?? "").toLowerCase().trim()] ?? "#8b8b8b";
}


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
  const [canEdit, setCanEdit] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [playerOrder, setPlayerOrder] = useState<"placement" | "slot" | "turn">("placement");
  const [leaverBusy, setLeaverBusy] = useState<string | null>(null);

  const titles = usePlayerTitles();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const select =
        "id, public_match_id, created_at, game_version, board_version, has_rise_of_ix, has_epic_mode, has_immortality, has_base_leaders, end_round, image_url, tournament_num, conflict_title, ai_scan_status, ai_scan_summary, game_results(placement, player_name, leader_name, points, elo_delta, elo_delta_overall, spice, solaris, water, is_leaver, player_slot, turn_order, player_color, has_first_player, has_high_council, has_swordmaster)";
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
  }, [matchId, reloadKey]);

  // Can the signed-in user edit this match? (admin or a participant)
  useEffect(() => {
    if (!game) return;
    let cancelled = false;
    void (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) { if (!cancelled) setCanEdit(false); return; }
      const names = new Set(game.game_results.map((r) => r.player_name.toLowerCase().trim()));
      const [{ data: roles }, { data: prof }, { data: claimed }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", uid),
        supabase.from("profiles").select("username").eq("id", uid).maybeSingle(),
        supabase.from("player_ratings").select("player_key").eq("claimed_by", uid),
      ]);
      if (cancelled) return;
      const isAdmin = (roles ?? []).some((r) => r.role === "admin");
      const mine = new Set<string>();
      if (prof?.username) mine.add(prof.username.toLowerCase().trim());
      (claimed ?? []).forEach((r) => r.player_key && mine.add(r.player_key.toLowerCase().trim()));
      setCanEdit(isAdmin || [...mine].some((n) => names.has(n)));
    })();
    return () => { cancelled = true; };
  }, [game?.id]);



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
    setSignedImg(await signedUrlOrR2("match-screenshots", game.image_url, 60 * 60));
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
  const slotSorted = [...game.game_results].sort(
    (a, b) => (a.player_slot ?? a.placement) - (b.player_slot ?? b.placement),
  );
  const orderedPlayers = [...game.game_results].sort((a, b) => {
    if (playerOrder === "slot") return (a.player_slot ?? 99) - (b.player_slot ?? 99);
    if (playerOrder === "turn") return (a.turn_order ?? 99) - (b.turn_order ?? 99);
    return a.placement - b.placement;
  });
  const hasSlots = game.game_results.some((r) => r.player_slot !== null && r.player_slot !== undefined);
  const hasTurns = game.game_results.some((r) => r.turn_order !== null && r.turn_order !== undefined);

  const toggleLeaver = async (playerName: string, value: boolean) => {
    setLeaverBusy(playerName);
    try {
      const client = supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
      };
      const { error } = await client.rpc("update_match_details", {
        p_game_id: game.id,
        p_end_round: game.end_round,
        p_board_version: game.board_version,
        p_has_rise_of_ix: game.has_rise_of_ix,
        p_has_epic_mode: game.has_epic_mode,
        p_has_immortality: game.has_immortality,
        p_has_base_leaders: game.has_base_leaders,
        p_conflict_title: game.conflict_title,
        p_players: game.game_results.map((r) => ({
          player_name: r.player_name,
          spice: r.spice,
          solaris: r.solaris,
          water: r.water,
          is_leaver: r.player_name === playerName ? value : (r.is_leaver ?? false),
          player_color: r.player_color,
          player_slot: r.player_slot,
          turn_order: r.turn_order,
          has_first_player: r.has_first_player,
          has_high_council: r.has_high_council,
          has_swordmaster: r.has_swordmaster,
        })),
      });
      if (error) throw new Error(error.message);
      toast.success(value ? "Marked as leaver" : "Leaver mark removed");
      setReloadKey((k) => k + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update leaver status");
    } finally {
      setLeaverBusy(null);
    }
  };



  const tags: string[] = [];
  if (game.board_version) tags.push(game.board_version === "uprising" ? "Uprising" : "Base");
  if (game.has_rise_of_ix) tags.push("Rise of Ix");
  if (game.has_epic_mode) tags.push("Epic");
  if (game.has_immortality) tags.push("Immortality");
  if (game.has_base_leaders) tags.push("Base Leaders");
  const roundTag =
    game.end_round !== null && game.end_round !== undefined
      ? game.conflict_title
        ? `Round ${game.end_round} · ${game.conflict_title}`
        : `Round ${game.end_round}`
      : game.conflict_title;
  if (roundTag) tags.push(roundTag);


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
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={copyLink}>
              <Copy className="size-4" /> Copy link
            </Button>
            {canEdit && (
              <EditMatchDialog game={game} onSaved={() => setReloadKey((k) => k + 1)} />
            )}
          </div>
        </div>


        <div className="flex flex-wrap items-center gap-2 mb-6">
          <TournamentTag num={game.tournament_num} round={tourneyTable?.round} table={tourneyTable?.table} />
          {game.ai_scan_status === "Yes" && (
            <span className="text-xs px-2 py-0.5 rounded border border-emerald-500/50 bg-emerald-500/10 text-emerald-400">
              ✓ AI Verified
            </span>
          )}
          {game.ai_scan_status === "Issue detected" && (
            <span
              title={game.ai_scan_summary ?? "Scan review needed"}
              className="text-xs px-2 py-0.5 rounded border border-amber-500/50 bg-amber-500/10 text-amber-400 cursor-help"
            >
              ⚠ Scan Review Needed
            </span>
          )}
          {tags.map((t) => (
            <span key={t} className="text-xs px-2 py-0.5 rounded bg-secondary/60 text-secondary-foreground">
              {t}
            </span>
          ))}
        </div>

        <LandsraadBar players={slotSorted} />


        <div className="grid gap-6 md:grid-cols-[1fr_auto]">
          <Card className="p-4 border-border/60 bg-card/70">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="font-display text-lg">Players</h2>
              {(hasSlots || hasTurns) && (
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-muted-foreground mr-1">Order by</span>
                  {([
                    { k: "placement" as const, label: "Placement", show: true },
                    { k: "slot" as const, label: "Player slot", show: hasSlots },
                    { k: "turn" as const, label: "Turn order", show: hasTurns },
                  ]).filter((o) => o.show).map((o) => (
                    <button
                      key={o.k}
                      onClick={() => setPlayerOrder(o.k)}
                      className={`px-2 py-1 rounded border ${
                        playerOrder === o.k
                          ? "border-sand/60 bg-sand/15 text-sand"
                          : "border-border/50 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              {orderedPlayers.map((r, i) => {
                const leaderRoute = r.leader_name ? leaderRouteFor(r.leader_name) : null;
                const portrait = leaderRoute ? portraits[leaderRoute.slug] : null;
                const key = r.player_name.toLowerCase().trim();
                const t = totals[key];
                const vpDelta = vpDeltas[key];
                const hex = colorHex(r.player_color);
                return (
                  <div
                    key={i}
                    className="border border-border/40 rounded px-3 py-2 bg-background/40 border-l-4"
                    style={{ borderLeftColor: hex }}
                  >
                    <div className="flex items-center gap-3">
                      <PlacementBadge placement={r.placement} />
                      <div className="relative shrink-0">
                        {leaderRoute ? (
                          <Link
                            to="/leaders/$origin/$slug"
                            params={{ origin: leaderRoute.origin, slug: leaderRoute.slug }}
                            className="block"
                            title={r.leader_name ?? ""}
                          >
                            <div
                              className="size-11 rounded-full overflow-hidden bg-card/60"
                              style={{ boxShadow: `0 0 0 2px ${hex}, 0 0 10px ${hex}66` }}
                            >
                              {portrait ? (
                                <SupabaseImage bucket="leader-portraits" src={portrait} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                  <Swords className="size-4" />
                                </div>
                              )}
                            </div>
                          </Link>
                        ) : (
                          <div
                            className="size-11 rounded-full bg-card/60 flex items-center justify-center text-muted-foreground"
                            style={{ boxShadow: `0 0 0 2px ${hex}` }}
                          >
                            <Swords className="size-4" />
                          </div>
                        )}
                        {r.has_first_player && (
                          <span
                            title="First player"
                            className="absolute -top-1 -left-1 size-4 rounded-full bg-[#b87333] border border-amber-200/60 text-[8px] flex items-center justify-center text-amber-50"
                          >
                            1
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <Link
                            to="/players/$key"
                            params={{ key }}
                            className="block truncate font-medium hover:underline underline-offset-2"
                            style={{ color: colorForKey(titles, r.player_name) }}
                          >
                            {r.player_name}
                          </Link>
                          {canEdit ? (
                            <label
                              className={`shrink-0 flex items-center gap-1.5 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border cursor-pointer ${
                                r.is_leaver
                                  ? "border-coral/50 bg-coral/10 text-coral"
                                  : "border-border/50 text-muted-foreground hover:text-foreground"
                              } ${leaverBusy === r.player_name ? "opacity-60 pointer-events-none" : ""}`}
                              title="Mark as leaver"
                            >
                              <input
                                type="checkbox"
                                className="size-3 accent-current"
                                checked={!!r.is_leaver}
                                disabled={leaverBusy === r.player_name}
                                onChange={(e) => void toggleLeaver(r.player_name, e.target.checked)}
                              />
                              Leaver
                            </label>
                          ) : (
                            r.is_leaver && (
                              <span className="shrink-0 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-coral/50 bg-coral/10 text-coral">
                                Leaver
                              </span>
                            )
                          )}
                        </div>
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
                        <ResourcePips spice={r.spice} solaris={r.solaris} water={r.water} />
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        {r.has_swordmaster !== null && r.has_swordmaster !== undefined && (
                          <AgentSilhouettes count={r.has_swordmaster ? 3 : 2} hex={hex} />
                        )}
                        <div className="flex items-center gap-2">
                          {r.turn_order !== null && r.turn_order !== undefined && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-border/60 text-muted-foreground">
                              Seat {r.turn_order}
                            </span>
                          )}
                          <span className="size-11 rounded-full border-2 border-sand/70 bg-sand/10 flex items-center justify-center font-display text-sand text-xl tabular-nums">
                            {r.points}
                          </span>
                        </div>
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

          <div className="w-full md:w-64 space-y-3">
            <ScoringScreenshotCard
              imageUrl={game.image_url}
              signedImg={signedImg}
              imgLoading={imgLoading}
              onOpen={openImage}
            />
            <VerificationCard
              game={game}
              displayId={displayId}
              canEdit={canEdit}
              onSaved={() => setReloadKey((k) => k + 1)}
            />
          </div>

        </div>

        <div className="mt-6 flex justify-end">
          <ConflictCard title={game.conflict_title} endRound={game.end_round} />
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

function ResourcePips({
  spice,
  solaris,
  water,
}: {
  spice: number | null;
  solaris: number | null;
  water: number | null;
}) {
  const items: Array<[string, string, number | null]> = [
    ["🟠", "Spice", spice],
    ["⚪", "Solaris", solaris],
    ["💧", "Water", water],
  ];
  const shown = items.filter(([, , v]) => v !== null && v !== undefined);
  if (shown.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
      {shown.map(([icon, label, v]) => (
        <span key={label} title={label} className="inline-flex items-center gap-1">
          <span aria-hidden>{icon}</span>
          {v}
        </span>
      ))}
    </div>
  );
}

type PlayerForm = {
  player_name: string;
  leader_name: string | null;
  placement: number;
  spice: string;
  solaris: string;
  water: string;
  is_leaver: boolean;
  player_color: string;
  player_slot: string;
  turn_order: string;
  has_first_player: boolean;
  has_high_council: boolean;
  has_swordmaster: boolean;
};

const numToStr = (n: number | null | undefined) =>
  n === null || n === undefined ? "" : String(n);

function EditMatchDialog({ game, onSaved }: { game: GameRow; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [endRound, setEndRound] = useState(numToStr(game.end_round));
  const [board, setBoard] = useState<"base" | "uprising">(
    game.board_version === "uprising" ? "uprising" : "base",
  );
  const [ix, setIx] = useState(game.has_rise_of_ix);
  const [immo, setImmo] = useState(game.has_immortality);
  const [epic, setEpic] = useState(game.has_epic_mode);
  const [baseLeaders, setBaseLeaders] = useState(game.has_base_leaders);
  const [conflictTitle, setConflictTitle] = useState(game.conflict_title ?? "");
  const [players, setPlayers] = useState<PlayerForm[]>([]);
  const [editOrder, setEditOrder] = useState<"placement" | "slot" | "turn">("placement");
  const orderedIndexes = players
    .map((_, i) => i)
    .sort((a, b) => {
      const pa = players[a]!;
      const pb = players[b]!;
      const num = (v: string) => (v.trim() === "" ? 99 : Number(v));
      if (editOrder === "slot") return num(pa.player_slot) - num(pb.player_slot);
      if (editOrder === "turn") return num(pa.turn_order) - num(pb.turn_order);
      return pa.placement - pb.placement;
    });

  const reset = useCallback(() => {
    setEndRound(numToStr(game.end_round));
    setBoard(game.board_version === "uprising" ? "uprising" : "base");
    setIx(game.has_rise_of_ix);
    setImmo(game.has_immortality);
    setEpic(game.has_epic_mode);
    setBaseLeaders(game.has_base_leaders);
    setConflictTitle(game.conflict_title ?? "");
    setPlayers(
      [...game.game_results]
        .sort((a, b) => a.placement - b.placement)
        .map((r) => ({
          player_name: r.player_name,
          leader_name: r.leader_name,
          placement: r.placement,
          spice: numToStr(r.spice),
          solaris: numToStr(r.solaris),
          water: numToStr(r.water),
          is_leaver: r.is_leaver ?? false,
          player_color: r.player_color ?? "",
          player_slot: numToStr(r.player_slot),
          turn_order: numToStr(r.turn_order),
          has_first_player: r.has_first_player ?? false,
          has_high_council: r.has_high_council ?? false,
          has_swordmaster: r.has_swordmaster ?? false,
        })),
    );
  }, [game]);

  useEffect(() => { reset(); }, [reset]);

  const setPlayer = (i: number, patch: Partial<PlayerForm>) =>
    setPlayers((ps) => ps.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  const save = async () => {
    setSaving(true);
    try {
      const client = supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
      };
      const { error } = await client.rpc("update_match_details", {
        p_game_id: game.id,
        p_end_round: endRound.trim() === "" ? null : Number(endRound),
        p_board_version: board,
        p_has_rise_of_ix: ix,
        p_has_epic_mode: epic,
        p_has_immortality: immo,
        p_has_base_leaders: baseLeaders,
        p_conflict_title: conflictTitle.trim() === "" ? null : conflictTitle.trim(),
        p_players: players.map((p) => ({
          player_name: p.player_name,
          spice: p.spice.trim() === "" ? null : Number(p.spice),
          solaris: p.solaris.trim() === "" ? null : Number(p.solaris),
          water: p.water.trim() === "" ? null : Number(p.water),
          is_leaver: p.is_leaver,
          player_color: p.player_color || null,
          player_slot: p.player_slot.trim() === "" ? null : Number(p.player_slot),
          turn_order: p.turn_order.trim() === "" ? null : Number(p.turn_order),
          has_first_player: p.has_first_player,
          has_high_council: p.has_high_council,
          has_swordmaster: p.has_swordmaster,
        })),
      });
      if (error) throw new Error(error.message);
      toast.success("Match details updated!");
      setOpen(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save match details");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Pencil className="size-4" /> Edit match details
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Edit match details</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Match settings
            </h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">End round (optional)</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={endRound}
                  onChange={(e) => setEndRound(e.target.value)}
                  placeholder="—"
                />
              </div>
              <div>
                <Label className="text-xs">Board version</Label>
                <select
                  value={board}
                  onChange={(e) => setBoard(e.target.value === "uprising" ? "uprising" : "base")}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="base">Base</option>
                  <option value="uprising">Uprising</option>
                </select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Conflict title</Label>
              <Input
                value={conflictTitle}
                onChange={(e) => setConflictTitle(e.target.value)}
                placeholder="e.g. Battle for Imperial Basin"
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <ToggleRow label="Rise of Ix" checked={ix} onChange={setIx} />
              <ToggleRow label="Immortality" checked={immo} onChange={setImmo} />
              <ToggleRow label="Epic Mode" checked={epic} onChange={setEpic} />
              <ToggleRow label="Base Leaders" checked={baseLeaders} onChange={setBaseLeaders} />
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Players
              </h3>
              <div className="flex items-center gap-1 text-xs">
                <span className="text-muted-foreground mr-1">Order by</span>
                {([
                  { k: "placement" as const, label: "Placement" },
                  { k: "slot" as const, label: "Player slot" },
                  { k: "turn" as const, label: "Turn order" },
                ]).map((o) => (
                  <button
                    key={o.k}
                    type="button"
                    onClick={() => setEditOrder(o.k)}
                    className={`px-2 py-1 rounded border ${
                      editOrder === o.k
                        ? "border-sand/60 bg-sand/15 text-sand"
                        : "border-border/50 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            {orderedIndexes.map((i) => {
              const p = players[i];
              if (!p) return null;
              const hex = colorHex(p.player_color);
              return (
              <div
                key={p.player_name + i}
                className="rounded-md border border-border/50 border-l-4 p-3 space-y-3 bg-background/40"
                style={{ borderLeftColor: hex }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex items-center gap-2">
                    <span
                      className="size-5 rounded-full border border-border/60 shrink-0"
                      style={{ backgroundColor: hex }}
                      title={p.player_color || "No colour set"}
                    />
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {p.placement}. {p.player_name}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {p.player_color || "no colour"}
                          {p.player_slot ? ` · slot ${p.player_slot}` : ""}
                          {p.turn_order ? ` · turn ${p.turn_order}` : ""}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{p.leader_name ?? "—"}</div>
                    </div>
                  </div>
                  <ToggleRow
                    label="Mark as leaver"
                    checked={p.is_leaver}
                    onChange={(v) => setPlayer(i, { is_leaver: v })}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">🟠 Spice</Label>
                    <Input
                      type="number"
                      min={0}
                      value={p.spice}
                      onChange={(e) => setPlayer(i, { spice: e.target.value })}
                      placeholder="—"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">⚪ Solaris</Label>
                    <Input
                      type="number"
                      min={0}
                      value={p.solaris}
                      onChange={(e) => setPlayer(i, { solaris: e.target.value })}
                      placeholder="—"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">💧 Water</Label>
                    <Input
                      type="number"
                      min={0}
                      value={p.water}
                      onChange={(e) => setPlayer(i, { water: e.target.value })}
                      placeholder="—"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <Label className="text-xs">Colour</Label>
                    <select
                      value={p.player_color}
                      onChange={(e) => setPlayer(i, { player_color: e.target.value })}
                      className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="">—</option>
                      <option value="Green">Green</option>
                      <option value="Yellow">Yellow</option>
                      <option value="Red">Red</option>
                      <option value="Blue">Blue</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Slot</Label>
                    <Input
                      type="number"
                      min={1}
                      max={4}
                      value={p.player_slot}
                      onChange={(e) => setPlayer(i, { player_slot: e.target.value })}
                      placeholder="—"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Turn order</Label>
                    <Input
                      type="number"
                      min={1}
                      max={4}
                      value={p.turn_order}
                      onChange={(e) => setPlayer(i, { turn_order: e.target.value })}
                      placeholder="—"
                    />
                  </div>
                </div>
                <div className="grid sm:grid-cols-3 gap-2">
                  <ToggleRow
                    label="First player"
                    checked={p.has_first_player}
                    onChange={(v) => setPlayer(i, { has_first_player: v })}
                  />
                  <ToggleRow
                    label="High Council"
                    checked={p.has_high_council}
                    onChange={(v) => setPlayer(i, { has_high_council: v })}
                  />
                  <ToggleRow
                    label="Swordmaster"
                    checked={p.has_swordmaster}
                    onChange={(v) => setPlayer(i, { has_swordmaster: v })}
                  />
                </div>
              </div>
              );
            })}
          </section>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />} Save changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <Switch checked={checked} onCheckedChange={onChange} />
      <span>{label}</span>
    </label>
  );
}

function AgentSilhouettes({ count, hex }: { count: number; hex: string }) {
  return (
    <span className="flex items-center gap-1" title={`${count} agents`}>
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className="block size-2.5 rounded-t-full rounded-b-sm"
          style={{ backgroundColor: hex, opacity: 0.85 }}
        />
      ))}
    </span>
  );
}

/** Section A — Landsraad bar: High Council seats + Swordmaster recruits. */
function LandsraadBar({ players }: { players: ResultRow[] }) {
  const councilKnown = players.some((p) => p.has_high_council !== null && p.has_high_council !== undefined);
  const swordKnown = players.some((p) => p.has_swordmaster !== null && p.has_swordmaster !== undefined);
  const council = players.filter((p) => p.has_high_council);
  const sword = players.filter((p) => p.has_swordmaster);
  if (council.length === 0 && sword.length === 0) return null;
  return (
    <Card className="mb-6 p-4 border-border/60 bg-card/70">
      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
        {councilKnown && council.length > 0 && (
          <div>
            <h2 className="font-display text-sm uppercase tracking-wider text-muted-foreground mb-2">
              High Council
            </h2>
            <div className="flex flex-wrap gap-3">
              {council.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span
                    className="size-9 rounded-full flex items-center justify-center text-[10px] font-display"
                    style={{ backgroundColor: colorHex(p.player_color), color: "#0b0b0b" }}
                  >
                    {i + 1}
                  </span>
                  <span className="text-xs text-muted-foreground max-w-[9rem] truncate">
                    {p.player_name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {swordKnown && sword.length > 0 && (
          <div className="md:border-l md:border-border/50 md:pl-4">
            <h2 className="font-display text-sm uppercase tracking-wider text-muted-foreground mb-2">
              Swordmaster
            </h2>
            <div className="flex flex-wrap gap-3">
              {sword.map((p, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs">
                  <ShieldCheck className="size-4" style={{ color: colorHex(p.player_color) }} />
                  <span className="max-w-[9rem] truncate">{p.player_name}</span>
                  
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}


/** Section C — conflict banner + end round. */
function ConflictCard({
  title,
  endRound,
}: {
  title: string | null;
  endRound: number | null;
}) {
  if (!title && (endRound === null || endRound === undefined)) return null;
  return (
    <Card className="p-4 border-border/60 bg-card/70 w-full md:w-[26rem]">
      <h2 className="font-display text-lg leading-tight">{title ?? "Conflict"}</h2>
      {endRound !== null && endRound !== undefined && (
        <div className="text-xs text-muted-foreground mt-1">Round {endRound} of 10</div>
      )}
    </Card>
  );
}

const R2_MATCH_BASE = "https://pub-6fb62f34a2e3491fa0c7c71cc9a969fd.r2.dev/matches";

/** Public R2 URL for a match's processed content-area screenshot. */
function r2ContentAreaUrl(id: string): string {
  return `${R2_MATCH_BASE}/${id}/${id}-content-area.png`;
}

/** Public R2 URL for the raw endboard screenshot uploaded by a player. */
function r2EndboardRawUrl(id: string): string {
  return `${R2_MATCH_BASE}/${id}/${id}-endboard-raw.png`;
}

/** Storage path (bucket-relative) for the raw endboard screenshot. */
function endboardPathFor(id: string): string {
  return `matches/${id}/${id}-endboard-raw.png`;
}

/**
 * Poll the public R2 domain until the telemetry Lambda has produced the
 * processed content-area image (or we give up). Never throws.
 */
async function waitForContentArea(
  id: string,
  timeoutMs = 60_000,
  intervalMs = 4_000,
): Promise<boolean> {
  const url = r2ContentAreaUrl(id);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}?cb=${Date.now()}`, { method: "HEAD", cache: "no-store" });
      if (res.ok) return true;
    } catch {
      // network hiccup — keep polling until the timeout
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

/** The original post-game scoring screenshot uploaded on submission. */
function ScoringScreenshotCard({
  imageUrl,
  signedImg,
  imgLoading,
  onOpen,
}: {
  imageUrl: string | null;
  signedImg: string | null;
  imgLoading: boolean;
  onOpen: () => Promise<void> | void;
}) {
  if (!imageUrl) return null;
  return (
    <Card className="p-3 border-border/60 bg-card/70">
      <h2 className="font-display text-sm mb-2 text-muted-foreground">Scoring screenshot</h2>
      <Dialog onOpenChange={(o) => { if (o) void onOpen(); }}>
        <DialogTrigger asChild>
          <button className="relative group w-full aspect-video rounded overflow-hidden border border-border/50 bg-background/40 flex items-center justify-center">
            {signedImg ? (
              <SupabaseImage
                bucket="match-screenshots"
                src={signedImg}
                alt="Scoring screenshot preview"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-xs text-muted-foreground">
                {imgLoading ? <Loader2 className="size-4 animate-spin" /> : "No screenshot"}
              </span>
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity">
              <Maximize2 className="size-5 text-sand" />
            </span>
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-4xl p-2 bg-background/95 backdrop-blur-md">
          {signedImg ? (
            <SupabaseImage
              bucket="match-screenshots"
              src={signedImg}
              alt="Scoring screenshot"
              className="w-full h-auto rounded max-h-[85vh] object-contain"
            />
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              <Loader2 className="size-6 animate-spin" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/**
 * Endboard telemetry screenshot: thumbnail card that opens the side-by-side
 * verification modal (interactive board telemetry left, screenshot right) and
 * lets authorised editors upload/replace the endboard capture.
 */
function VerificationCard({
  game,
  displayId,
  canEdit,
  onSaved,
}: {
  game: GameRow;
  displayId: string;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const contentUrl = r2ContentAreaUrl(displayId);
  const rawUrl = r2EndboardRawUrl(displayId);
  const [bust, setBust] = useState(0);
  const suffix = bust ? `?v=${bust}` : "";
  const [src, setSrc] = useState<string>(contentUrl);
  const [broken, setBroken] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [players, setPlayers] = useState<TelemetryPlayer[]>(game.game_results);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSrc(contentUrl);
    setBroken(false);
  }, [contentUrl, bust]);

  useEffect(() => {
    setPlayers(game.game_results);
  }, [game.game_results]);

  const handleError = () => {
    if (src.startsWith(contentUrl)) {
      setSrc(rawUrl);
      return;
    }
    setBroken(true);
  };

  const handleUpload = async (file: File | null | undefined) => {
    if (!file || !canEdit || uploading || scanning) return;
    setUploading(true);
    setScanning(false);
    try {
      // 1. Direct upload to Cloudflare R2 (never touches Supabase Storage).
      const rawKey = endboardPathFor(displayId);
      const publicRawUrl = r2EndboardRawUrl(displayId);
      await uploadToR2("match-screenshots", rawKey, file.type || "image/png", file);
      toast.success("Endboard screenshot uploaded — running telemetry");

      setUploading(false);
      setScanning(true);

      // Short pause so the object is served by the CDN before the Lambda reads it.
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // 2. Trigger the telemetry Lambda with the public R2 URL.
      const lambdaResponse = await fetch(TELEMETRY_LAMBDA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match_id: displayId, image_url: publicRawUrl }),
      });
      if (!lambdaResponse.ok) {
        const errText = await lambdaResponse.text().catch(() => "");
        throw new Error(`Lambda scan failed (${lambdaResponse.status}): ${errText}`);
      }
      await lambdaResponse.json().catch(() => null);

      // 3. Show the processed content-area image.
      setBroken(false);
      setSrc(`${r2ContentAreaUrl(displayId)}?t=${Date.now()}`);
      setBust(Date.now());
      toast.success("Endboard screenshot uploaded to R2 and telemetry scanned!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to process screenshot");
    } finally {
      setUploading(false);
      setScanning(false);
    }
  };


  const persist = async (next: TelemetryPlayer[], message: string) => {
    setPlayers(next);
    setSaving(true);
    try {
      const client = supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
      };

      const { error } = await client.rpc("update_match_details", {
        p_game_id: game.id,
        p_end_round: game.end_round,
        p_board_version: game.board_version,
        p_has_rise_of_ix: game.has_rise_of_ix,
        p_has_epic_mode: game.has_epic_mode,
        p_has_immortality: game.has_immortality,
        p_has_base_leaders: game.has_base_leaders,
        p_conflict_title: game.conflict_title,
        p_players: next.map((p) => ({
          player_name: p.player_name,
          spice: p.spice,
          solaris: p.solaris,
          water: p.water,
          is_leaver: p.is_leaver ?? false,
          player_color: p.player_color,
          player_slot: p.player_slot,
          turn_order: p.turn_order,
          has_first_player: p.has_first_player,
          has_high_council: p.has_high_council,
          has_swordmaster: p.has_swordmaster,
        })),
      });
      if (error) throw new Error(error.message);
      toast.success(message);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save telemetry");
      setPlayers(game.game_results);
    } finally {
      setSaving(false);
    }
  };

  const slotOrdered = [...players].sort(
    (a, b) => (a.player_slot ?? a.placement) - (b.player_slot ?? b.placement),
  );
  const wurmAssigned = players.some((p) => p.has_first_player);

  const setFirstPlayer = (slot: number | null) => {
    if (!canEdit || !slot) return;
    void persist(applyFirstPlayer(players, slot, game.end_round), "First player updated");
  };

  const toggleSeat = (seat: number) => {
    if (!canEdit) return;
    const target = players.find((p) => (p.turn_order ?? 0) === seat);
    if (!target) return;
    const next = players.map((p) =>
      p.player_name === target.player_name ? { ...p, has_high_council: !p.has_high_council } : p,
    );
    void persist(next, target.has_high_council ? "Seat vacated" : "High Council seat taken");
  };

  const toggleSwordmaster = (name: string) => {
    if (!canEdit) return;
    const target = players.find((p) => p.player_name === name);
    if (!target) return;
    const value = target.has_swordmaster !== true;
    const next = players.map((p) => (p.player_name === name ? { ...p, has_swordmaster: value } : p));
    void persist(next, value ? "Swordmaster recruited" : "Swordmaster removed");
  };

  return (
    <Card className="p-3 border-border/60 bg-card/70 w-full">
      <h2 className="font-display text-sm mb-2 text-muted-foreground">Endboard state</h2>
      <Dialog>
        <DialogTrigger asChild>
          <button
            disabled={broken}
            className="relative group w-full aspect-video rounded overflow-hidden border border-border/50 bg-background/40 flex items-center justify-center disabled:cursor-default"
          >
            {broken ? (
              <span className="text-xs text-muted-foreground inline-flex items-center gap-2">
                {uploading || scanning ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {uploading ? "Uploading…" : "Scanning endboard…"}
                  </>
                ) : (
                  "No endboard screenshot"
                )}
              </span>
            ) : (
              <img
                src={`${src}${suffix}`}
                onError={handleError}
                alt="Endboard screenshot preview"
                className="w-full h-full object-cover"
              />
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity">
              <Maximize2 className="size-5 text-sand" />
            </span>
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-[95vw] xl:max-w-[1400px] p-4 bg-background/95 backdrop-blur-md max-h-[92vh] overflow-y-auto">

          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              Verify match #{displayId}
              {saving && <Loader2 className="size-4 animate-spin text-sand" />}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Left pane — interactive board telemetry */}
            <div className="space-y-4">
              {!wurmAssigned && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <WurmToken unknown muted={false} />
                  First player not assigned{canEdit ? " — click a worm slot below" : ""}
                </div>
              )}

              <div className="space-y-2">
                {slotOrdered.map((p) => {
                  const hex = colorHex(p.player_color);
                  return (
                    <div
                      key={p.player_name}
                      className="rounded-md border-2 bg-background/40 px-3 py-2 transition-all duration-300"
                      style={{ borderColor: hex, boxShadow: `inset 3px 0 0 ${hex}` }}
                    >
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => setFirstPlayer(p.player_slot)}
                          title={
                            p.has_first_player
                              ? "First player"
                              : canEdit
                                ? "Make first player"
                                : "Not first player"
                          }
                          className={`shrink-0 rounded-full ${canEdit ? "cursor-pointer hover:scale-110" : "cursor-default"} transition-transform duration-200`}
                        >
                          <WurmToken muted={!p.has_first_player} />
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{p.player_name}</div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {p.leader_name ?? "—"}
                            {p.player_slot ? ` · slot ${p.player_slot}` : ""}
                            {p.turn_order ? ` · turn ${p.turn_order}` : ""}
                          </div>
                        </div>
                        <AgentRow
                          p={p}
                          canEdit={canEdit}
                          onToggleSwordmaster={() => toggleSwordmaster(p.player_name)}
                        />
                        <span className="size-9 shrink-0 rounded-full border-2 border-sand/70 bg-sand/10 flex items-center justify-center font-display text-sand tabular-nums">
                          {p.points}
                        </span>
                      </div>
                      <ResourceBadges p={p} />
                    </div>
                  );
                })}
              </div>

              <Card className="p-3 border-border/60 bg-card/60 space-y-3">
                <HighCouncilSeats players={players} canEdit={canEdit} onToggleSeat={toggleSeat} />
                <SwordmasterSpace
                  players={players}
                  canEdit={canEdit}
                  onToggleSwordmaster={toggleSwordmaster}
                />
              </Card>

              {(game.conflict_title || game.end_round) && (
                <Card className="p-3 border-border/60 bg-card/60">
                  <div className="font-display text-base leading-tight">
                    {game.conflict_title ?? "Conflict"}
                  </div>
                  {game.end_round !== null && game.end_round !== undefined && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Round {game.end_round} of 10
                    </div>
                  )}
                </Card>
              )}
            </div>

            {/* Right pane — full resolution screenshot */}
            <div className="rounded border border-border/50 bg-background/40 flex items-center justify-center overflow-hidden">
              {broken ? (
                <span className="text-xs text-muted-foreground p-8">Screenshot unavailable</span>
              ) : (
                <img
                  src={`${src}${suffix}`}
                  onError={handleError}
                  alt="Endboard screenshot"
                  className="w-full h-auto object-contain max-h-[80vh]"
                />
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {canEdit && (
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void handleUpload(e.dataTransfer.files?.[0]);
          }}
          className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded border border-dashed border-sand/50 bg-sand/5 px-2 py-2 text-[11px] text-sand hover:bg-sand/10 transition-colors"
        >
          {uploading || scanning ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Maximize2 className="size-3.5" />
          )}
          {uploading
            ? "Uploading…"
            : scanning
              ? "Scanning endboard…"
              : broken
                ? "Upload endboard screenshot"
                : "Replace endboard"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploading || scanning}
            onChange={(e) => {
              void handleUpload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      )}
    </Card>
  );

}
