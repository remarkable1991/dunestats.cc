import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { parseScreenshot, saveGame } from "@/lib/games.functions";
import { normalizeNames } from "@/lib/name-normalize";
import { detectExpansions } from "@/lib/leaders";
import { translateLeader } from "@/lib/leader-translate";
import { useChampions, isChampion } from "@/lib/champions";
import { toast } from "sonner";
import { Image as ImageIcon, Loader2, Trophy, Upload as UploadIcon, CheckCircle2, Maximize2, HelpCircle } from "lucide-react";
import { Calendar, Sword, History, ExternalLink } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { EloDeltaLine, TournamentTag } from "@/components/EloDelta";
import exampleMatch from "@/assets/example-match.png.asset.json";
import ixIcon from "@/assets/ix.png.asset.json";
import uprisingIcon from "@/assets/uprising.png.asset.json";
import immoIcon from "@/assets/immo.png.asset.json";
import epicIcon from "@/assets/epic.png.asset.json";
import { ArrowLeft, Users as UsersIcon, ArrowUp, ArrowDown, ArrowUpDown, Sparkles } from "lucide-react";
import { TournamentAnnouncement, TournamentCountdown } from "@/components/TournamentCountdown";
import { AvailabilityHeatmap, type HeatmapPlayer } from "@/components/AvailabilityHeatmap";

export const Route = createFileRoute("/tournament")({
  head: () => ({ meta: [{ title: "Live Tournament · Strategy Arena" }] }),
  component: TournamentPage,
});

const SWISS_ROUNDS = ["Game 1", "Game 2", "Game 3"] as const;
const PLAYOFF_ROUNDS = ["Finals"] as const;
const TABLE_OPTIONS = [
  "Table 1","Table 2","Table 3","Table 4","Table 5","Table 6","Table 7",
  "Semi Final 1","Semi Final 2","Grand Final!",
];

type Row = {
  id: string;
  tournament_num: number;
  round_type: string;
  table_identifier: string;
  player_name: string;
  discord_username: string | null;
  leader_name: string | null;
  placement: number | null;
  points: number | null;
  table_score: number | null;
  player_compatibility_score: number | null;
  player_availability: string[] | null;
};
type Shot = { tournament_num: number; round_type: string; table_identifier: string; image_url: string };

function CurrentTournament({ tournamentNum, onBack }: { tournamentNum: number; onBack: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [shots, setShots] = useState<Shot[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayMode, setDisplayMode] = useState<"player" | "discord">("player");
  const [logTab, setLogTab] = useState<"swiss" | "playoffs">("swiss");
  const uploadRef = useRef<HTMLDivElement>(null);

  // Upload panel state (mirrors /upload but routed to tournament_matches)
  const [round, setRound] = useState<string>("Game 1");
  const [tableId, setTableId] = useState<string>("Table 1");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parsedRows, setParsedRows] = useState<{ placement: number; player_name: string; leader_name: string; points: number }[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [myKeys, setMyKeys] = useState<Set<string>>(new Set());
  const [board, setBoard] = useState<"base" | "uprising">("uprising");
  const [hasIx, setHasIx] = useState(false);
  const [hasEpic, setHasEpic] = useState(false);
  const [hasImmortality, setHasImmortality] = useState(false);
  const [hasBaseLeaders, setHasBaseLeaders] = useState(false);
  const [tpOpen, setTpOpen] = useState(false);
  const [heatmapKey, setHeatmapKey] = useState<string | null>(null); // "round__table"
  const isT14 = tournamentNum === 14;
  type SaveResult = Awaited<ReturnType<typeof saveGame>>;
  const [lastSave, setLastSave] = useState<SaveResult | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
  }, []);

  useEffect(() => {
    if (!userId) { setMyKeys(new Set()); return; }
    void (async () => {
      const { data } = await supabase
        .from("player_ratings")
        .select("player_key")
        .eq("claimed_by", userId);
      setMyKeys(new Set((data ?? []).map((r) => r.player_key)));
    })();
  }, [userId]);

  const isMine = (name: string) => myKeys.has(name.toLowerCase().trim());
  const champions = useChampions();

  const refresh = async () => {
    setLoading(true);
    const [r, s] = await Promise.all([
      supabase.from("tournament_matches").select("*").eq("tournament_num", tournamentNum),
      supabase.from("tournament_table_screenshots").select("*").eq("tournament_num", tournamentNum),
    ]);
    setRows((r.data ?? []) as Row[]);
    setShots((s.data ?? []) as Shot[]);
    setLoading(false);
  };
  useEffect(() => { void refresh(); }, []);

  // ===== TP scoring + standings =====
  const standings = useMemo(() => {
    type Agg = { player: string; discord: string; tp: number; wins: number; placements: number[]; vp: number; vpShareSum: number };
    const map = new Map<string, Agg>();
    // Group rows by (round, table)
    const tables = new Map<string, Row[]>();
    for (const row of rows) {
      const k = `${row.round_type}__${row.table_identifier}`;
      if (!tables.has(k)) tables.set(k, []);
      tables.get(k)!.push(row);
    }
    for (const tableRows of tables.values()) {
      // Only score if all 4 placements & points are present
      const ranked = tableRows
        .filter((r) => r.placement && r.points != null)
        .sort((a, b) => (a.placement ?? 9) - (b.placement ?? 9));
      if (ranked.length < 4) continue;
      const vps = ranked.map((r) => r.points ?? 0);
      const tableVpTotal = vps.reduce((s, n) => s + n, 0);
      const tps = [
        20 + (vps[0] - vps[1]),
        Math.max(0, 15 - (vps[0] - vps[1])),
        Math.max(0, 10 - (vps[0] - vps[2])),
        Math.max(0, 5 - (vps[0] - vps[3])),
      ].map((v) => Math.max(0, v));
      ranked.forEach((r, i) => {
        const key = r.player_name;
        const agg = map.get(key) ?? { player: r.player_name, discord: r.discord_username ?? r.player_name, tp: 0, wins: 0, placements: [], vp: 0, vpShareSum: 0 };
        agg.tp += tps[i];
        if (r.placement === 1) agg.wins += 1;
        agg.placements.push(r.placement ?? 0);
        agg.vp += r.points ?? 0;
        agg.vpShareSum += tableVpTotal > 0 ? (r.points ?? 0) / tableVpTotal : 0;
        if (r.discord_username) agg.discord = r.discord_username;
        map.set(key, agg);
      });
    }
    // Include unranked players with 0s so leaderboard shows everyone
    for (const row of rows) {
      if (!map.has(row.player_name)) {
        map.set(row.player_name, {
          player: row.player_name, discord: row.discord_username ?? row.player_name,
          tp: 0, wins: 0, placements: [], vp: 0, vpShareSum: 0,
        });
      }
    }
    const list = [...map.values()].map((a) => ({
      ...a,
      avgPlacement: a.placements.length ? a.placements.reduce((s, n) => s + n, 0) / a.placements.length : 4,
      vpPct: a.placements.length ? (a.vpShareSum / a.placements.length) * 100 : 0,
    }));
    list.sort((a, b) => {
      if (b.tp !== a.tp) return b.tp - a.tp;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (a.avgPlacement !== b.avgPlacement) return a.avgPlacement - b.avgPlacement;
      if (b.vp !== a.vp) return b.vp - a.vp;
      return b.vpPct - a.vpPct;
    });
    return list;
  }, [rows]);

  const playoffs = useMemo(() => {
    const rank = (i: number) => standings[i - 1];
    return {
      semi1: [3, 6, 7, 10].map(rank).filter(Boolean),
      semi2: [4, 5, 8, 9].map(rank).filter(Boolean),
      grand: [1, 2].map(rank).filter(Boolean),
    };
  }, [standings]);

  const swissProgress = useMemo(() => {
    const roundTables = new Map<string, Map<string, Row[]>>();
    for (const r of rows) {
      if (!SWISS_ROUNDS.includes(r.round_type as (typeof SWISS_ROUNDS)[number])) continue;
      if (!roundTables.has(r.round_type)) roundTables.set(r.round_type, new Map());
      const tables = roundTables.get(r.round_type)!;
      if (!tables.has(r.table_identifier)) tables.set(r.table_identifier, []);
      tables.get(r.table_identifier)!.push(r);
    }
    return SWISS_ROUNDS.map((rt) => {
      const tables = roundTables.get(rt) ?? new Map<string, Row[]>();
      const total = tables.size;
      let completed = 0;
      for (const tableRows of tables.values()) {
        const ranked = tableRows.filter((r) => r.placement != null && r.points != null);
        if (ranked.length >= 4) completed++;
      }
      const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
      return { round: rt, completed, total, pct };
    });
  }, [rows]);

  // Helper: get screenshot URL for a table
  const shotFor = (rt: string, ti: string) => shots.find((s) => s.round_type === rt && s.table_identifier === ti);

  // ===== Match logs grouped =====
  const groupedLogs = useMemo(() => {
    const inSwiss = (rt: string) => (SWISS_ROUNDS as readonly string[]).includes(rt);
    const filter = logTab === "swiss" ? inSwiss : (rt: string) => !inSwiss(rt);
    const byRound = new Map<string, Map<string, Row[]>>();
    for (const r of rows) {
      if (!filter(r.round_type)) continue;
      if (!byRound.has(r.round_type)) byRound.set(r.round_type, new Map());
      const tables = byRound.get(r.round_type)!;
      if (!tables.has(r.table_identifier)) tables.set(r.table_identifier, []);
      tables.get(r.table_identifier)!.push(r);
    }
    return byRound;
  }, [rows, logTab]);

  // ===== Upload handlers =====
  const onFile = async (f: File | null) => {
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f ? URL.createObjectURL(f) : null);
    if (!f) return setParsedRows([]);
    setParsing(true);
    try {
      const b64 = await fileToBase64(f);
      const res = await parseScreenshot({ data: { imageBase64: b64, mimeType: f.type || "image/png" } });
      const rawDetected = res.results.map((r) => ({
        placement: r.placement, player_name: r.player_name, leader_name: translateLeader(r.leader_name) ?? (r.leader_name ?? ""), points: r.points,
      }));
      const detected = await normalizeNames(rawDetected);
      setParsedRows(detected);

      // Auto-detect board version + expansions from leaders
      const sug = detectExpansions(detected.map((d) => d.leader_name));
      setBoard(sug.board_version);
      setHasIx(sug.has_rise_of_ix);
      setHasBaseLeaders(sug.has_base_leaders);
      setHasEpic(false);
      setHasImmortality(false);

      // Auto-detect Round + Table by matching detected players to known tournament rows
      const detectedKeys = detected.map((d) => d.player_name.toLowerCase().trim()).filter(Boolean);
      const groups = new Map<string, { round: string; table: string; players: string[] }>();
      for (const r of rows) {
        const k = `${r.round_type}__${r.table_identifier}`;
        if (!groups.has(k)) groups.set(k, { round: r.round_type, table: r.table_identifier, players: [] });
        groups.get(k)!.players.push(r.player_name.toLowerCase().trim());
      }
      let best: { round: string; table: string } | null = null;
      let bestScore = 0;
      for (const g of groups.values()) {
        const score = detectedKeys.reduce((acc, dk) => {
          const hit = g.players.some((p) => p === dk || p.includes(dk) || dk.includes(p));
          return acc + (hit ? 1 : 0);
        }, 0);
        if (score > bestScore) { bestScore = score; best = { round: g.round, table: g.table }; }
      }
      if (best && bestScore >= 2) {
        setRound(best.round);
        setTableId(best.table);
        toast.success(`Detected ${detected.length} players · matched ${best.round} · ${best.table}`);
      } else {
        toast.success(`Detected ${detected.length} players. Pick Round/Table manually.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read screenshot");
    } finally { setParsing(false); }
  };

  const openSubmitFor = (rt: string, ti: string) => {
    setRound(rt); setTableId(ti);
    uploadRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const submitResults = async () => {
    if (!userId) return toast.error("Sign in to submit results.");
    if (parsedRows.length < 4) return toast.error("Need 4 detected players.");
    if (hasEpic && !hasIx) return toast.error("Epic Mode requires Rise of Ix.");
    setSaving(true);
    try {
      // Upload screenshot
      let imagePath: string | null = null;
      if (file) {
        const ext = (file.name.split(".").pop() || "png").toLowerCase();
        imagePath = `${userId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("match-screenshots")
          .upload(imagePath, file, { contentType: file.type || "image/png", upsert: false });
        if (upErr) throw upErr;
        await supabase.from("tournament_table_screenshots").upsert(
          { tournament_num: tournamentNum, round_type: round, table_identifier: tableId, image_url: imagePath, created_by: userId },
          { onConflict: "tournament_num,round_type,table_identifier" },
        );
      }
      // Match each parsed row to a tournament_matches row by player_name (fuzzy: case-insensitive includes)
      const tableRows = rows.filter((r) => r.round_type === round && r.table_identifier === tableId);
      for (const pr of parsedRows) {
        const lower = pr.player_name.toLowerCase().trim();
        const target = tableRows.find((r) =>
          r.player_name.toLowerCase() === lower ||
          r.player_name.toLowerCase().includes(lower) ||
          lower.includes(r.player_name.toLowerCase()),
        );
        if (!target) continue;
        await supabase.from("tournament_matches").update({
          placement: pr.placement,
          points: pr.points,
          leader_name: pr.leader_name || null,
          updated_at: new Date().toISOString(),
        }).eq("id", target.id);
      }

      // Also submit to the global leaderboard, unless an identical match exists
      // in the last 25 uploaded games (fingerprint = sorted player|points pairs).
      const fingerprint = (rs: { player_name: string; points: number }[]) =>
        rs
          .map((r) => `${r.player_name.toLowerCase().trim()}|${r.points}`)
          .sort()
          .join("~");
      const incomingFp = fingerprint(parsedRows);
      const { data: recent } = await supabase
        .from("games")
        .select("id, created_at, game_results(player_name, points)")
        .order("created_at", { ascending: false })
        .limit(25);
      const dup = (recent ?? []).some((g: any) =>
        Array.isArray(g.game_results) && fingerprint(g.game_results) === incomingFp,
      );
      if (!dup) {
        try {
          const res = await saveGame({
            data: {
              board_version: board,
              has_rise_of_ix: hasIx,
              has_epic_mode: hasEpic,
              has_immortality: hasImmortality,
              has_base_leaders: hasBaseLeaders,
              match_screenshot_url: imagePath,
              tournament_num: tournamentNum,
              results: parsedRows.map((r) => ({
                placement: r.placement,
                player_name: r.player_name.trim(),
                leader_name: r.leader_name?.trim() || null,
                points: Number(r.points) || 0,
              })),
            },
          });
          setLastSave(res);
          toast.success("Results submitted to tournament + global leaderboard!");
        } catch (e) {
          toast.warning(`Tournament saved. Leaderboard skipped: ${e instanceof Error ? e.message : "unknown error"}`);
        }
      } else {
        toast.success("Results submitted! (Already on leaderboard — skipped duplicate.)");
      }

      setFile(null); setPreview(null); setParsedRows([]);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Submission failed");
    } finally { setSaving(false); }
  };

  return (
      <div className="space-y-8">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-sand hover:text-sand -mb-4">
          <ArrowLeft className="size-4 mr-1" /> Back to Current Tournaments
        </Button>
        <header className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-display text-3xl flex items-center gap-2"><Trophy className="size-7 text-sand" /> Live Tournament #{tournamentNum}</h1>
            <p className="text-muted-foreground">Live standings update as match screenshots are uploaded.</p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                uploadRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
              className="border-sand/60 text-sand hover:bg-sand/10"
            >
              <UploadIcon className="size-4 mr-1" /> Upload now
            </Button>
            <Label className="text-xs text-muted-foreground">Display:</Label>
            <span className={displayMode === "player" ? "text-sand" : "text-muted-foreground text-sm"}>Direwolf</span>
            <Switch checked={displayMode === "discord"} onCheckedChange={(c) => setDisplayMode(c ? "discord" : "player")} />
            <span className={displayMode === "discord" ? "text-sand" : "text-muted-foreground text-sm"}>Discord</span>
          </div>
        </header>

        <Dialog open={tpOpen} onOpenChange={setTpOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">Tournament Points (TP) <HelpCircle className="size-5 text-coral" /></DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground pt-2 space-y-3">
                <p>Your final Tournament Points (TP) are based on how you finish, adjusted by how close everyone was to the winner's score:</p>
                <p><strong>1st Place (Base: 20 TP):</strong> Earns an extra +1 TP for every Victory Point they win by ahead of 2nd place.</p>
                <p><strong>2nd, 3rd, &amp; 4th Place (Base: 15, 10, 5 TP):</strong> Lose -1 TP for every Victory Point they fall behind the winner (clamped to a minimum of 0).</p>
                <p className="text-sand font-medium">In short: Winning by a lot gives you a massive bonus. If you lose, keeping the score close saves your tournament rank!</p>
              </DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin text-sand" /></div>
        ) : (
          <>
            {/* League Phase Progress */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {swissProgress.map((p) => (
                <Card
                  key={p.round}
                  onClick={() => {
                    setLogTab("swiss");
                    requestAnimationFrame(() => {
                      const el = document.getElementById(`round-${p.round.replace(/\s+/g, "-")}`);
                      el?.scrollIntoView({ behavior: "smooth", block: "start" });
                    });
                  }}
                  className="p-4 border-border/60 bg-card/70 shadow-arena cursor-pointer hover:border-sand transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-display text-sm">{p.round}</span>
                    <span className="text-xs text-muted-foreground">
                      {p.completed}/{p.total} played ({p.pct}%)
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-sand transition-all duration-500"
                      style={{ width: `${p.pct}%` }}
                    />
                  </div>
                </Card>
              ))}
            </div>

            {/* Standings */}
            <Card className="p-6 border-border/60 bg-card/70 shadow-arena">
              <h2 className="font-display text-xl mb-4">Live Standings</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-muted-foreground text-xs uppercase">
                    <tr className="border-b border-border/40">
                      <th className="text-left py-2 px-2">#</th>
                      <th className="text-left py-2 px-2">Player</th>
                      <th className="text-right py-2 px-2 cursor-pointer" onClick={() => setTpOpen(true)}>
                        <span className="inline-flex items-center gap-1">
                          TP <HelpCircle className="size-3.5 text-coral" />
                        </span>
                      </th>
                      <th className="text-right py-2 px-2">Wins</th>
                      <th className="text-right py-2 px-2">Avg Place</th>
                      <th className="text-right py-2 px-2">VP</th>
                      <th className="text-right py-2 px-2">VP %</th>
                      <th className="text-right py-2 px-2">Games</th>
                      <th className="text-left py-2 px-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((s, i) => {
                      const rank = i + 1;
                      const gold = rank <= 2;
                      const silver = rank >= 3 && rank <= 10;
                      const mine = isMine(s.player);
                      return (
                        <tr key={s.player} className={`border-b border-border/20 ${mine ? "bg-sand/15 ring-2 ring-sand" : gold ? "bg-amber-500/10 ring-1 ring-amber-400/60" : silver ? "bg-slate-400/5 ring-1 ring-slate-400/40" : ""}`}>
                          <td className="py-2 px-2 font-mono">{rank}</td>
                          <td className="py-2 px-2 font-medium">
                            <Link
                              to="/players/$key"
                              params={{ key: s.player.toLowerCase().trim() }}
                              className="hover:text-sand hover:underline underline-offset-2 transition-colors"
                            >
                              {displayMode === "discord" ? s.discord : s.player}
                            </Link>
                            {isChampion(champions, s.player) && (
                              <Trophy className="inline size-4 text-sand ml-1 -mt-0.5" aria-label="Hall of Fame Champion" />
                            )}
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-sand">{s.tp}</td>
                          <td className="py-2 px-2 text-right font-mono">{s.wins}</td>
                          <td className="py-2 px-2 text-right font-mono">{s.placements.length ? s.avgPlacement.toFixed(2) : "—"}</td>
                          <td className="py-2 px-2 text-right font-mono">{s.vp}</td>
                          <td className="py-2 px-2 text-right font-mono">{s.placements.length ? `${s.vpPct.toFixed(1)}%` : "—"}</td>
                          <td className="py-2 px-2 text-right font-mono">{s.placements.length}</td>
                          <td className="py-2 px-2 text-xs">
                            {gold && <Badge className="bg-amber-500/80 text-black">Direct to Grand Finals</Badge>}
                            {silver && <Badge variant="outline" className="border-slate-300/60 text-slate-200">Qualified for Semi Finals</Badge>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Playoff bracket */}
            <p className="text-xs text-muted-foreground italic">
              Projected Semi Finals based on current standings.
            </p>
            <div className="grid md:grid-cols-3 gap-4">
              <BracketCard title="Semi Final 1" players={playoffs.semi1.map((p) => displayMode === "discord" ? p.discord : p.player)} accent="slate" />
              <BracketCard title="Semi Final 2" players={playoffs.semi2.map((p) => displayMode === "discord" ? p.discord : p.player)} accent="slate" />
              <BracketCard title="Grand Final!" players={[...playoffs.grand.map((p) => displayMode === "discord" ? p.discord : p.player), "Winner SF1", "Winner SF2"]} accent="amber" />
            </div>

            {/* Match logs */}
            <Card className="p-6 border-border/60 bg-card/70 shadow-arena">
              <h2 className="font-display text-xl mb-4">Match Logs</h2>
              <Tabs value={logTab} onValueChange={(v) => setLogTab(v as "swiss" | "playoffs")}>
                <TabsList>
                  <TabsTrigger value="swiss">League Phase</TabsTrigger>
                  <TabsTrigger value="playoffs">Finals</TabsTrigger>
                </TabsList>
                <TabsContent value={logTab} className="mt-4 space-y-6">
                   {[...groupedLogs.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([rt, tables]) => (
                     <div key={rt} id={`round-${rt.replace(/\s+/g, "-")}`} className="scroll-mt-24">
                      <h3 className="font-display text-lg text-sand mb-2">{rt}</h3>
                      <div className="grid md:grid-cols-2 gap-3">
                        {[...tables.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([ti, players]) => {
                          const shot = shotFor(rt, ti);
                          const sorted = [...players].sort((a, b) => (a.placement ?? 9) - (b.placement ?? 9));
                          return (
                            <div key={ti} className="border border-border/40 rounded-md p-3 bg-background/40">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium">{ti}</span>
                                  {isT14 && players[0]?.table_score != null && (
                                    <button
                                      type="button"
                                      onClick={() => setHeatmapKey(`${rt}__${ti}`)}
                                      className="inline-flex items-center gap-1 rounded-full border border-sand/40 bg-sand/15 px-2 py-0.5 text-[11px] text-sand hover:bg-sand/25 transition"
                                      title="View availability heatmap"
                                    >
                                      <Sparkles className="size-3" /> Match Quality {players[0].table_score}
                                    </button>
                                  )}
                                </div>
                                {shot ? (
                                  <ScreenshotLightbox
                                    path={shot.image_url}
                                    trigger={
                                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white">
                                        <ImageIcon className="size-4 mr-1" /> See results
                                      </Button>
                                    }
                                  />
                                ) : (
                                  <Button size="sm" variant="outline" onClick={() => openSubmitFor(rt, ti)}>Submit Table Results</Button>
                                )}
                              </div>
                              <ul className="space-y-1 text-sm">
                                {sorted.map((p) => (
                                  <li key={p.id} className={`flex justify-between gap-2 px-2 py-0.5 rounded ${isMine(p.player_name) ? "bg-sand/15 ring-1 ring-sand/60" : ""}`}>
                                    <span><span className="font-mono text-muted-foreground mr-2">{p.placement ?? "—"}</span>{displayMode === "discord" ? (p.discord_username ?? p.player_name) : p.player_name}</span>
                                    <span className="font-mono text-sand">{p.points ?? "—"} VP</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </TabsContent>
              </Tabs>
            </Card>

            {/* Inline submission panel */}
            <div ref={uploadRef as any} className="scroll-mt-24">
              <div className="flex items-center gap-2 mb-4">
                <UploadIcon className="size-6 text-sand" />
                <h2 className="font-display text-2xl">Submit Table Results</h2>
              </div>
              <p className="text-muted-foreground mb-6 text-sm">
                Drop your Dune Imperium Digital end-screen screenshot — Round &amp; Table auto-detect from the detected players.
                Confirm the board version + expansions, then submit.
              </p>
              {!userId && <p className="text-coral text-sm mb-3">Sign in to submit results.</p>}

              <div className="grid lg:grid-cols-2 gap-6">
                <Card className="p-6 border-border/60 bg-card/70 shadow-arena">
                  <div className="space-y-4">
                    <div>
                      <Label>Screenshot</Label>
                      <label
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f && f.type.startsWith("image/")) void onFile(f); }}
                        className="flex flex-col items-center justify-center border-2 border-dashed border-border/70 rounded-lg p-8 cursor-pointer hover:border-sand transition-colors bg-background/40"
                      >
                        {preview ? (
                          <img src={preview} alt="preview" className="max-h-72 rounded shadow-arena" />
                        ) : (
                          <>
                            <UploadIcon className="size-8 text-sand mb-2" />
                            <span className="text-sm text-muted-foreground text-center">
                              Click, drag &amp; drop a screenshot (PNG / JPG)
                            </span>
                          </>
                        )}
                        <Input type="file" accept="image/*" className="hidden" onChange={(e) => void onFile(e.target.files?.[0] ?? null)} />
                      </label>
                      <div className="mt-3 flex items-start gap-3 rounded-md border border-border/50 bg-background/30 p-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <button type="button" className="relative group shrink-0">
                              <img src={exampleMatch.url} alt="Example end-screen" className="h-20 w-auto rounded border border-border/60 group-hover:border-sand transition" />
                              <span className="absolute inset-0 flex items-center justify-center bg-background/40 opacity-0 group-hover:opacity-100 rounded">
                                <Maximize2 className="size-4 text-sand" />
                              </span>
                            </button>
                          </DialogTrigger>
                          <DialogContent className="max-w-4xl p-2">
                            <img src={exampleMatch.url} alt="Example end-screen" className="w-full h-auto rounded" />
                          </DialogContent>
                        </Dialog>
                        <p className="text-xs text-muted-foreground">
                          Example end-screen — your screenshot should look like this. Click to expand.
                        </p>
                      </div>
                      {parsing && (
                        <p className="text-sm text-sand mt-2 flex items-center gap-2">
                          <Loader2 className="size-4 animate-spin" /> Analysing screenshot with AI…
                        </p>
                      )}
                    </div>

                    <div className="space-y-4 pt-2">
                      <div>
                        <Label className="mb-2 block">Board version <span className="text-coral">*</span></Label>
                        <RadioGroup value={board} onValueChange={(v) => setBoard(v as "base" | "uprising")} className="grid grid-cols-2 gap-2">
                          <label className="flex items-center gap-2 border border-border/60 rounded-md px-3 py-2 cursor-pointer hover:border-sand">
                            <RadioGroupItem value="base" /> <span>Base Game</span>
                          </label>
                          <label className="flex items-center gap-2 border border-border/60 rounded-md px-3 py-2 cursor-pointer hover:border-sand">
                            <RadioGroupItem value="uprising" /> <span>Uprising</span>
                          </label>
                        </RadioGroup>
                      </div>
                      <div>
                        <Label className="mb-2 block">Expansions (optional)</Label>
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <Checkbox checked={hasIx} onCheckedChange={(c) => { setHasIx(!!c); if (!c) setHasEpic(false); }} />
                            Rise of Ix
                          </label>
                          <label className={`flex items-center gap-2 ${hasIx ? "cursor-pointer" : "opacity-40 cursor-not-allowed"}`}>
                            <Checkbox checked={hasEpic} disabled={!hasIx} onCheckedChange={(c) => setHasEpic(!!c)} />
                            Epic Mode <span className="text-xs text-muted-foreground">(requires Rise of Ix)</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <Checkbox checked={hasImmortality} onCheckedChange={(c) => setHasImmortality(!!c)} />
                            Immortality
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <Checkbox checked={hasBaseLeaders} onCheckedChange={(c) => setHasBaseLeaders(!!c)} />
                            Base Leaders
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>

                <Card className="p-6 border-border/60 bg-card/70 shadow-arena">
                  <h2 className="font-display text-lg mb-3">Detected results</h2>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div>
                      <Label className="text-xs">Tournament</Label>
                      <Select value={String(tournamentNum)} disabled>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value={String(tournamentNum)}>{tournamentNum}</SelectItem></SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Round Type</Label>
                      <Select value={round} onValueChange={setRound}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[...SWISS_ROUNDS, ...PLAYOFF_ROUNDS].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Table</Label>
                      <Select value={tableId} onValueChange={setTableId}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TABLE_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {parsedRows.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">
                      Upload a screenshot to see detected players here.
                    </p>
                  ) : (
                    <ul className="space-y-1.5 text-sm">
                      {parsedRows.slice().sort((a, b) => a.placement - b.placement).map((r, i) => (
                        <li
                          key={i}
                          className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_44px] gap-2 items-center rounded-md px-1 py-1.5"
                        >
                          <span className="font-display text-sand text-sm w-4 text-center tabular-nums">{r.placement}</span>
                          <span className="truncate font-medium">{r.player_name}</span>
                          <span className="truncate text-muted-foreground">{r.leader_name || "?"}</span>
                          <span className="text-center font-mono text-sand tabular-nums">{r.points}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <Button
                    onClick={submitResults}
                    disabled={saving || !userId || parsedRows.length === 0}
                    className="w-full mt-4"
                  >
                    {saving ? <><Loader2 className="size-4 animate-spin" /> Submitting…</> : <><CheckCircle2 className="size-4" /> Submit to {round} · {tableId}</>}
                  </Button>
                </Card>
              </div>

              {lastSave && (
                <Card className="p-4 mt-6 border-sand/40 bg-card/70">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 className="size-5 text-emerald-400" />
                    <h2 className="font-display text-lg">Match saved</h2>
                    <TournamentTag num={lastSave.tournament_num} />
                  </div>
                  <ul className="space-y-1 text-sm">
                    {[...lastSave.deltas].sort((a, b) => a.placement - b.placement).map((d, i) => (
                      <li key={i} className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex size-5 items-center justify-center rounded bg-secondary/60 text-[10px] font-bold">{d.placement}</span>
                        <span className="font-medium">{d.player_name}</span>
                        <EloDeltaLine version={lastSave.game_version} overall={d.overall_delta} versionDelta={d.version_delta} />
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          </>
        )}
        {isT14 && heatmapKey && (() => {
          const [rt, ti] = heatmapKey.split("__");
          const tableRows = rows.filter((r) => r.round_type === rt && r.table_identifier === ti);
          const players: HeatmapPlayer[] = tableRows.map((r) => ({
            player_name: r.player_name,
            discord_username: r.discord_username,
            player_compatibility_score: r.player_compatibility_score,
            player_availability: r.player_availability,
          }));
          return (
            <AvailabilityHeatmap
              open={true}
              onOpenChange={(v) => { if (!v) setHeatmapKey(null); }}
              tableId={`${rt} · ${ti}`}
              matchQuality={tableRows[0]?.table_score ?? null}
              players={players}
            />
          );
        })()}
      </div>
  );
}

function BracketCard({ title, players, accent }: { title: string; players: string[]; accent: "amber" | "slate" }) {
  const ring = accent === "amber" ? "ring-amber-400/60 bg-amber-500/5" : "ring-slate-400/40 bg-slate-400/5";
  return (
    <Card className={`p-4 border-border/60 ring-1 ${ring}`}>
      <h3 className="font-display text-lg mb-3">{title}</h3>
      <ul className="space-y-1 text-sm">
        {players.length === 0 && <li className="text-muted-foreground italic">Awaiting standings…</li>}
        {players.map((p, i) => <li key={i} className="font-mono">{i + 1}. {p}</li>)}
      </ul>
    </Card>
  );
}

function ScreenshotLightbox({ path, trigger }: { path: string; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const onOpen = async (next: boolean) => {
    setOpen(next);
    if (next && !url) {
      if (/^https?:\/\//i.test(path)) setUrl(path);
      else {
        const { data } = await supabase.storage.from("match-screenshots").createSignedUrl(path, 3600);
        setUrl(data?.signedUrl ?? null);
      }
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpen}>
      <DialogTrigger asChild>
        {trigger ?? <button className="text-sand hover:text-sand/80" title="View screenshot"><ImageIcon className="size-4" /></button>}
      </DialogTrigger>
      <DialogContent className="max-w-4xl p-2 bg-background/95 backdrop-blur-md">
        {url ? <img src={url} alt="Screenshot" className="w-full h-auto rounded max-h-[80vh] object-contain" /> : <div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin" /></div>}
        <div className="flex justify-end mt-2"><Button variant="outline" size="sm" onClick={() => setOpen(false)}>Close</Button></div>
      </DialogContent>
    </Dialog>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { const s = String(r.result); resolve(s.includes(",") ? s.split(",")[1] : s); };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// ─── Top-level tournament page with 3 chronological tabs ───────────────────

type TopTab = "future" | "current" | "previous";
const TAB_ORDER: TopTab[] = ["future", "current", "previous"];

function TournamentPage() {
  const [tab, setTab] = useState<TopTab>("current");
  const [prev, setPrev] = useState<TopTab>("current");
  const dir = TAB_ORDER.indexOf(tab) - TAB_ORDER.indexOf(prev); // +1 right, -1 left

  const switchTo = (next: TopTab) => {
    if (next === tab) return;
    setPrev(tab);
    setTab(next);
  };

  const buttons: { id: TopTab; title: string; subtitle: string; icon: React.ReactNode }[] = [
    { id: "future",   title: "Future Tournaments",   subtitle: "Register Now",        icon: <Calendar className="size-5" /> },
    { id: "current",  title: "Current Tournaments",  subtitle: "Active Battlegrounds", icon: <Sword className="size-5" /> },
    { id: "previous", title: "Previous Tournaments", subtitle: "Hall of Fame",        icon: <History className="size-5" /> },
  ];

  // animate-in slide direction: moving to higher idx → enter from right; lower idx → enter from left
  const slideClass = dir >= 0
    ? "animate-in slide-in-from-right-10 fade-in duration-300"
    : "animate-in slide-in-from-left-10 fade-in duration-300";

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-8">
          {buttons.map((b) => {
            const active = b.id === tab;
            return (
              <button
                key={b.id}
                disabled={active}
                onClick={() => switchTo(b.id)}
                className={`group rounded-xl border px-4 py-3 text-left transition-all ${
                  active
                    ? "border-sand bg-sand/15 text-sand cursor-default shadow-inner"
                    : "border-border bg-card/50 hover:bg-card hover:border-sand/60 cursor-pointer"
                }`}
              >
                <div className="flex items-center gap-2 font-display text-sm">
                  {b.icon}
                  <span>{b.title}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{b.subtitle}</div>
              </button>
            );
          })}
        </div>

        <div key={tab} className={slideClass}>
          {tab === "future" && <FutureTournaments />}
          {tab === "current" && <CurrentTournament />}
          {tab === "previous" && <PreviousTournaments />}
        </div>
      </div>
    </div>
  );
}

function FutureTournaments() {
  return (
    <div className="space-y-6">
      <TournamentAnnouncement />
      <TournamentCountdown />
    </div>
  );
}

type PastRow = {
  id: string;
  tournament_num: number;
  round_type: string;
  table_identifier: string;
  player_name: string;
  leader_name: string | null;
  points: number;
  placement: number;
  board_version: string;
  has_rise_of_ix: boolean;
  has_epic_mode: boolean;
  has_immortality: boolean;
};

function configBadge(r: { board_version: string; has_rise_of_ix: boolean; has_epic_mode: boolean; has_immortality: boolean }): string {
  if (r.board_version === "uprising") {
    return r.has_immortality ? "Uprising + Immortality" : "Uprising Base";
  }
  const ix = r.has_rise_of_ix, ep = r.has_epic_mode, im = r.has_immortality;
  if (ix && ep && im) return "Base + Rise of Ix + Immortality (Epic Mode)";
  if (ix && im) return "Base + Rise of Ix + Immortality";
  if (ix && ep) return "Base + Rise of Ix (Epic Mode)";
  if (ix) return "Base + Rise of Ix";
  if (im) return "Base + Immortality";
  return "Base Game";
}

// ─── Hall of Fame ───────────────────────────────────────────────────────────

type ModeFlags = { hasIx: boolean; hasEpic: boolean; hasImmo: boolean; hasUprising: boolean };

function detectTournamentModes(rows: PastRow[]): ModeFlags {
  return {
    hasIx: rows.some((r) => r.has_rise_of_ix),
    hasEpic: rows.some((r) => r.has_epic_mode),
    hasImmo: rows.some((r) => r.has_immortality),
    hasUprising: rows.some((r) => r.board_version === "uprising"),
  };
}

function ModeBadges({ flags, size = 28 }: { flags: ModeFlags; size?: number }) {
  const items: Array<{ key: string; src: string; label: string }> = [];
  if (flags.hasUprising) items.push({ key: "up", src: uprisingIcon.url, label: "Uprising" });
  if (flags.hasIx) items.push({ key: "ix", src: ixIcon.url, label: "Rise of Ix" });
  if (flags.hasEpic) items.push({ key: "epic", src: epicIcon.url, label: "Epic Mode" });
  if (flags.hasImmo) items.push({ key: "immo", src: immoIcon.url, label: "Immortality" });
  if (items.length === 0) {
    return <span className="text-xs text-muted-foreground italic">Base Game</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((it) => (
        <span key={it.key} className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-background/40 border border-border/60 rounded-full pl-1 pr-2 py-0.5">
          <img src={it.src} alt={it.label} width={size} height={size} className="rounded-full" style={{ width: size, height: size }} />
          <span>{it.label}</span>
        </span>
      ))}
    </div>
  );
}

function PlayerLink({ name, className }: { name: string; className?: string }) {
  const key = name.toLowerCase().trim();
  return (
    <Link to="/players/$key" params={{ key }} className={className ?? "hover:text-sand"}>
      {name}
    </Link>
  );
}

function PreviousTournaments() {
  const [rows, setRows] = useState<PastRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      const all: PastRow[] = [];
      const page = 1000;
      for (let from = 0; ; from += page) {
        const { data, error } = await supabase
          .from("past_tournament_results")
          .select("id, tournament_num, round_type, table_identifier, player_name, leader_name, points, placement, board_version, has_rise_of_ix, has_epic_mode, has_immortality")
          .order("tournament_num", { ascending: false })
          .order("round_type")
          .order("table_identifier")
          .order("placement")
          .range(from, from + page - 1);
        if (error) { console.error(error); break; }
        all.push(...((data ?? []) as PastRow[]));
        if (!data || data.length < page) break;
      }
      setRows(all);
      setLoading(false);
    })();
  }, []);

  const tournaments = useMemo(() => {
    const m = new Map<number, PastRow[]>();
    for (const r of rows) {
      if (!m.has(r.tournament_num)) m.set(r.tournament_num, []);
      m.get(r.tournament_num)!.push(r);
    }
    return [...m.entries()]
      .map(([num, tRows]) => {
        const winnerRow = tRows.find(
          (r) => r.round_type === "Finals" && /grand/i.test(r.table_identifier) && r.placement === 1,
        );
        const players = new Set(tRows.map((r) => r.player_name));
        return {
          num,
          rows: tRows,
          winner: winnerRow?.player_name ?? "—",
          playerCount: players.size,
          modes: detectTournamentModes(tRows),
        };
      })
      .sort((a, b) => b.num - a.num);
  }, [rows]);

  if (loading) {
    return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading archive…</div>;
  }

  if (selected != null) {
    const t = tournaments.find((x) => x.num === selected);
    if (!t) {
      setSelected(null);
      return null;
    }
    return (
      <TournamentDeepDive
        tournament={t}
        onBack={() => setSelected(null)}
      />
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <h2 className="font-display text-3xl flex items-center gap-2"><Trophy className="size-7 text-sand" /> Hall of Fame</h2>
        <p className="text-muted-foreground text-sm">Twelve tournaments. Twelve champions. Tap any trophy to open the full bracket.</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tournaments.map((t) => (
          <button
            key={t.num}
            onClick={() => setSelected(t.num)}
            className="text-left group rounded-xl border border-border bg-card/50 hover:bg-card hover:border-sand transition-all p-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-sand"
          >
            <div className="flex items-center gap-4">
              <div className="relative flex items-center justify-center size-16 rounded-full bg-gradient-to-br from-sand/30 to-sand/5 border border-sand/40 shadow-inner">
                <Trophy className="size-7 text-sand" />
                <span className="absolute -bottom-1 -right-1 inline-flex items-center justify-center size-7 rounded-full bg-background text-sand font-display text-sm border border-sand/60">
                  {t.num}
                </span>
              </div>
              <div className="min-w-0">
                <div className="font-display text-lg leading-tight truncate" title={t.winner}>
                  🏆 {t.winner}
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <UsersIcon className="size-3.5" /> {t.playerCount} players
                </div>
              </div>
            </div>
            <div className="mt-4">
              <ModeBadges flags={t.modes} size={22} />
            </div>
            <div className="mt-3 text-[11px] uppercase tracking-wide text-sand/80 opacity-0 group-hover:opacity-100 transition-opacity">
              Open deep-dive →
            </div>
          </button>
        ))}
      </div>

      <HallOfFameMasterTable tournaments={tournaments} />
    </div>
  );
}

// ─── Tournament deep-dive ──────────────────────────────────────────────────

type TournamentSummary = {
  num: number;
  rows: PastRow[];
  winner: string;
  playerCount: number;
  modes: ModeFlags;
};

function TournamentDeepDive({ tournament, onBack }: { tournament: TournamentSummary; onBack: () => void }) {
  const { num, rows, winner, playerCount, modes } = tournament;

  const finalsByTable = useMemo(() => {
    const m = new Map<string, PastRow[]>();
    for (const r of rows) {
      if (r.round_type !== "Finals") continue;
      if (!m.has(r.table_identifier)) m.set(r.table_identifier, []);
      m.get(r.table_identifier)!.push(r);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.placement - b.placement);
    return m;
  }, [rows]);

  const grandFinalKey = useMemo(
    () => [...finalsByTable.keys()].find((k) => /grand/i.test(k)) ?? null,
    [finalsByTable],
  );
  const semiKeys = useMemo(
    () => [...finalsByTable.keys()].filter((k) => /semi/i.test(k)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [finalsByTable],
  );

  const qualRounds = useMemo(() => {
    const m = new Map<string, Map<string, PastRow[]>>();
    for (const r of rows) {
      if (r.round_type === "Finals") continue;
      if (!m.has(r.round_type)) m.set(r.round_type, new Map());
      const inner = m.get(r.round_type)!;
      if (!inner.has(r.table_identifier)) inner.set(r.table_identifier, []);
      inner.get(r.table_identifier)!.push(r);
    }
    for (const inner of m.values())
      for (const arr of inner.values()) arr.sort((a, b) => a.placement - b.placement);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  }, [rows]);

  // Per-tournament standings (TP / Wins / Avg / VP) — same formula as live.
  const standings = useMemo(() => {
    type Agg = { player: string; tp: number; wins: number; placements: number[]; vp: number };
    const map = new Map<string, Agg>();
    const tables = new Map<string, PastRow[]>();
    for (const r of rows) {
      const k = `${r.round_type}__${r.table_identifier}`;
      if (!tables.has(k)) tables.set(k, []);
      tables.get(k)!.push(r);
    }
    for (const tableRows of tables.values()) {
      const ranked = [...tableRows]
        .filter((r) => r.placement && r.points != null)
        .sort((a, b) => a.placement - b.placement);
      if (ranked.length < 4) continue;
      const vps = ranked.map((r) => r.points);
      const tps = [
        20 + (vps[0] - vps[1]),
        Math.max(0, 15 - (vps[0] - vps[1])),
        Math.max(0, 10 - (vps[0] - vps[2])),
        Math.max(0, 5 - (vps[0] - vps[3])),
      ].map((v) => Math.max(0, v));
      ranked.forEach((r, i) => {
        const agg = map.get(r.player_name) ?? { player: r.player_name, tp: 0, wins: 0, placements: [], vp: 0 };
        agg.tp += tps[i];
        if (r.placement === 1) agg.wins += 1;
        agg.placements.push(r.placement);
        agg.vp += r.points;
        map.set(r.player_name, agg);
      });
    }
    return [...map.values()]
      .map((a) => ({ ...a, avg: a.placements.length ? a.placements.reduce((s, n) => s + n, 0) / a.placements.length : 0 }))
      .sort((a, b) => b.tp - a.tp || b.wins - a.wins || a.avg - b.avg || b.vp - a.vp);
  }, [rows]);

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={onBack} className="text-sand hover:text-sand">
        <ArrowLeft className="size-4 mr-1" /> Back to Hall of Fame
      </Button>

      {/* Header card mirrors the Hall of Fame card */}
      <Card className="p-6 border-sand/40 bg-gradient-to-br from-card to-card/40">
        <div className="flex items-center gap-4">
          <div className="relative flex items-center justify-center size-20 rounded-full bg-gradient-to-br from-sand/40 to-sand/10 border border-sand/50 shadow-inner">
            <Trophy className="size-9 text-sand" />
            <span className="absolute -bottom-1 -right-1 inline-flex items-center justify-center size-8 rounded-full bg-background text-sand font-display text-base border border-sand/60">
              {num}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Champion</div>
            <div className="font-display text-2xl">
              🏆 <PlayerLink name={winner} className="hover:text-sand" />
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <UsersIcon className="size-3.5" /> {playerCount} players competed
            </div>
            <div className="mt-3"><ModeBadges flags={modes} size={24} /></div>
          </div>
        </div>
      </Card>

      {/* Bracket */}
      <section className="space-y-4">
        <h3 className="font-display text-xl text-sand">Bracket</h3>
        {grandFinalKey ? (
          <BracketTable title="Grand Final" rows={finalsByTable.get(grandFinalKey)!} accent />
        ) : (
          <Card className="p-4 text-sm text-muted-foreground italic">No Grand Final data recorded.</Card>
        )}
        {semiKeys.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {semiKeys.map((k) => (
              <BracketTable key={k} title={k} rows={finalsByTable.get(k)!} />
            ))}
          </div>
        )}
      </section>

      {/* Per-tournament leaderboard */}
      <section className="space-y-3">
        <h3 className="font-display text-xl text-sand">Tournament Leaderboard</h3>
        <Card className="p-0 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Player</TableHead>
                <TableHead className="text-right">TP</TableHead>
                <TableHead className="text-right">Wins</TableHead>
                <TableHead className="text-right">Avg Place</TableHead>
                <TableHead className="text-right">VP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {standings.map((s, i) => (
                <TableRow key={s.player}>
                  <TableCell className="font-medium text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">
                    <PlayerLink name={s.player} />
                  </TableCell>
                  <TableCell className="text-right font-display text-sand tabular-nums">{s.tp}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.wins}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.avg.toFixed(2)}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.vp}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </section>

      {/* Qualification rounds */}
      <section className="space-y-3">
        <h3 className="font-display text-xl text-sand">Qualification Rounds</h3>
        <Accordion type="multiple" className="space-y-2">
          {qualRounds.map(([round, tables]) => (
            <AccordionItem key={round} value={round} className="border rounded-lg bg-card/40 px-4">
              <AccordionTrigger className="hover:no-underline">
                <span className="font-display text-sand">{round}</span>
                <span className="ml-2 text-xs text-muted-foreground">({tables.size} tables)</span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                  {[...tables.entries()]
                    .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
                    .map(([table, entries]) => (
                      <BracketTable key={table} title={table} rows={entries} compact />
                    ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </div>
  );
}

function BracketTable({ title, rows, accent, compact }: { title: string; rows: PastRow[]; accent?: boolean; compact?: boolean }) {
  return (
    <Card className={`p-3 ${accent ? "border-sand/60 bg-gradient-to-br from-sand/5 to-card" : "bg-background/40"}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`font-display ${accent ? "text-base text-sand" : "text-sm"}`}>{title}</span>
        {rows[0] && (
          <Badge className="bg-sand/15 text-sand border-sand/40 text-[10px]" variant="outline">
            {configBadge(rows[0])}
          </Badge>
        )}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className={compact ? "h-7 w-10" : "w-10"}>#</TableHead>
            <TableHead className={compact ? "h-7" : ""}>Player</TableHead>
            <TableHead className={compact ? "h-7" : ""}>Leader</TableHead>
            <TableHead className={`text-right ${compact ? "h-7 w-12" : "w-16"}`}>VP</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className={`font-medium ${compact ? "py-1" : ""}`}>{r.placement}</TableCell>
              <TableCell className={compact ? "py-1" : ""}>
                <PlayerLink name={r.player_name} />
              </TableCell>
              <TableCell className={`text-muted-foreground text-xs ${compact ? "py-1" : ""}`}>{r.leader_name ?? "—"}</TableCell>
              <TableCell className={`text-right tabular-nums ${compact ? "py-1" : ""}`}>{r.points}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

// ─── Lifetime master stats table ───────────────────────────────────────────

type LifetimeAgg = {
  player: string;
  wins: number;
  grandFinals: number;
  semiFinals: number;
  played: number;
  tp: number;
};
type LifeSortKey = "wins" | "grandFinals" | "semiFinals" | "played" | "tp" | "tpPer";

function HallOfFameMasterTable({ tournaments }: { tournaments: TournamentSummary[] }) {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<LifeSortKey>("wins");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const lifetime = useMemo(() => {
    const m = new Map<string, LifetimeAgg>();
    const ensure = (name: string) => {
      let a = m.get(name);
      if (!a) {
        a = { player: name, wins: 0, grandFinals: 0, semiFinals: 0, played: 0, tp: 0 };
        m.set(name, a);
      }
      return a;
    };
    for (const t of tournaments) {
      const playersInT = new Set<string>();
      const grand = new Set<string>();
      const semi = new Set<string>();
      // group by (round, table)
      const tables = new Map<string, PastRow[]>();
      for (const r of t.rows) {
        playersInT.add(r.player_name);
        if (r.round_type === "Finals" && /grand/i.test(r.table_identifier)) grand.add(r.player_name);
        if (r.round_type === "Finals" && /semi/i.test(r.table_identifier)) semi.add(r.player_name);
        const k = `${r.round_type}__${r.table_identifier}`;
        if (!tables.has(k)) tables.set(k, []);
        tables.get(k)!.push(r);
      }
      // TP per table
      for (const tr of tables.values()) {
        const ranked = [...tr].filter((r) => r.placement && r.points != null).sort((a, b) => a.placement - b.placement);
        if (ranked.length < 4) continue;
        const vps = ranked.map((r) => r.points);
        const tps = [
          20 + (vps[0] - vps[1]),
          Math.max(0, 15 - (vps[0] - vps[1])),
          Math.max(0, 10 - (vps[0] - vps[2])),
          Math.max(0, 5 - (vps[0] - vps[3])),
        ].map((v) => Math.max(0, v));
        ranked.forEach((r, i) => { ensure(r.player_name).tp += tps[i]; });
      }
      for (const p of playersInT) ensure(p).played += 1;
      for (const p of semi) ensure(p).semiFinals += 1;
      for (const p of grand) ensure(p).grandFinals += 1;
      const winnerRow = t.rows.find((r) => r.round_type === "Finals" && /grand/i.test(r.table_identifier) && r.placement === 1);
      if (winnerRow) ensure(winnerRow.player_name).wins += 1;
    }
    return [...m.values()];
  }, [tournaments]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const arr = needle ? lifetime.filter((r) => r.player.toLowerCase().includes(needle)) : lifetime;
    const valOf = (r: LifetimeAgg): number => {
      switch (sortKey) {
        case "wins": return r.wins;
        case "grandFinals": return r.grandFinals;
        case "semiFinals": return r.semiFinals;
        case "played": return r.played;
        case "tp": return r.tp;
        case "tpPer": return r.played ? r.tp / r.played : 0;
      }
    };
    const sorted = [...arr].sort((a, b) => {
      const av = valOf(a), bv = valOf(b);
      if (av === bv) return a.player.localeCompare(b.player);
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return sorted;
  }, [lifetime, q, sortKey, sortDir]);

  const headerCell = (key: LifeSortKey, label: string, align: "left" | "right" = "right") => {
    const active = sortKey === key;
    const Icon = !active ? ArrowUpDown : sortDir === "desc" ? ArrowDown : ArrowUp;
    return (
      <TableHead className={align === "right" ? "text-right" : ""}>
        <button
          type="button"
          onClick={() => {
            if (!active) { setSortKey(key); setSortDir("desc"); return; }
            setSortDir((d) => (d === "desc" ? "asc" : "desc"));
          }}
          className={`inline-flex items-center gap-1 hover:text-sand ${active ? "text-sand" : ""}`}
        >
          {label} <Icon className="size-3.5" />
        </button>
      </TableHead>
    );
  };

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-display text-2xl text-sand flex items-center gap-2"><Trophy className="size-5" /> Lifetime Hall of Fame</h3>
          <p className="text-xs text-muted-foreground">Aggregated across every archived tournament.</p>
        </div>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search player…"
          className="max-w-xs"
        />
      </div>
      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Player</TableHead>
              {headerCell("wins", "Wins")}
              {headerCell("grandFinals", "GF reached")}
              {headerCell("semiFinals", "SF reached")}
              {headerCell("played", "Played")}
              {headerCell("tp", "Total TP")}
              {headerCell("tpPer", "TP / Tournament")}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.player}>
                <TableCell className="font-medium">
                  <span className="inline-flex items-center gap-1">
                    {r.wins >= 3 && <Trophy className="size-4 text-sand" aria-label="Hall of Fame Champion" />}
                    <PlayerLink name={r.player} />
                  </span>
                </TableCell>
                <TableCell className="text-right font-display text-sand tabular-nums">{r.wins}</TableCell>
                <TableCell className="text-right tabular-nums">{r.grandFinals}</TableCell>
                <TableCell className="text-right tabular-nums">{r.semiFinals}</TableCell>
                <TableCell className="text-right tabular-nums">{r.played}</TableCell>
                <TableCell className="text-right tabular-nums">{r.tp}</TableCell>
                <TableCell className="text-right tabular-nums">{(r.played ? r.tp / r.played : 0).toFixed(1)}</TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground italic py-6">No players match.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </section>
  );
}