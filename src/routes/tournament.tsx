import { createFileRoute, Link } from "@tanstack/react-router";
import { SupabaseImage } from "@/components/SupabaseImage";
import { signedUrlOrR2 } from "@/lib/storage-r2";
import { useEffect, useMemo, useRef, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { PrizesInfo } from "@/components/PrizesInfo";
import { TruncatedInfoText } from "@/components/TruncatedInfoText";
import { CheckinBanner } from "@/components/CheckinBanner";
import { AdminTournamentsLink } from "@/components/AdminTournamentsLink";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { parseScreenshot, saveGame } from "@/lib/games.functions";
import { submitMatch } from "@/lib/match-submit";
import { normalizeNames } from "@/lib/name-normalize";
import { detectExpansions } from "@/lib/leaders";
import { translateLeader } from "@/lib/leader-translate";
import { useChampions, isChampion } from "@/lib/champions";
import { loadTournamentModes, tournamentModes } from "@/lib/tournament-config";
import { toast } from "sonner";
import {
  Image as ImageIcon,
  Loader2,
  Trophy,
  Upload as UploadIcon,
  CheckCircle2,
  Maximize2,
  HelpCircle,
} from "lucide-react";
import { Calendar, Sword, History, ExternalLink } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { EloDeltaLine, TournamentTag } from "@/components/EloDelta";
import { usePlayerTitles, colorForKey } from "@/lib/player-title";

import exampleMatch from "@/assets/example-match.png.asset.json";
import ixIcon from "@/assets/ix.png.asset.json";
import uprisingIcon from "@/assets/uprising.png.asset.json";
import immoIcon from "@/assets/immo.png.asset.json";
import epicIcon from "@/assets/epic.png.asset.json";
import { ArrowLeft, Users as UsersIcon, ArrowUp, ArrowDown, ArrowUpDown, Sparkles } from "lucide-react";
import {
  type TournamentConfig,
  checkinStart,
  fetchOpenTournaments,
  fetchTournaments,
  formatTournamentFormat,
  bracketPlan,
  seedSemiTables,
  formatLongDate,
  registrationClosesAt,
  tournamentDayCount,
} from "@/lib/tournaments";

import { AvailabilityHeatmap, type HeatmapPlayer } from "@/components/AvailabilityHeatmap";
import { TableScheduleControls } from "@/components/TableScheduleControls";
import { RosterEditDialog } from "@/components/RosterEditDialog";
import { type MatchSchedule, SCHEDULE_SELECT, parseScheduleTime } from "@/lib/match-schedules";
import { tableSlug } from "@/lib/tournament-slug";
import { TournamentPlayModeBadge, tournamentPlayMode, playModeDescription } from "@/components/TournamentPlayModeBadge";
import { useRegistrationAvailability, withRegistrationAvailability } from "@/lib/registration-availability";


import { Pencil } from "lucide-react";

export const Route = createFileRoute("/tournament")({
  head: () => ({
    meta: [
      { title: "Live Tournament · Strategy Arena" },
      {
        name: "description",
        content: "Live Dune Imperium tournament brackets, standings, registration and results on Strategy Arena.",
      },
      { property: "og:title", content: "Live Tournament · Strategy Arena" },
      {
        property: "og:description",
        content: "Live Dune Imperium tournament brackets, standings, registration and results.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://dunestats.cc/tournament" },
    ],
    links: [{ rel: "canonical", href: "https://dunestats.cc/tournament" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "EventSeries",
          name: "Strategy Arena Dune Imperium Tournaments",
          url: "https://dunestats.cc/tournament",
          eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
          eventStatus: "https://schema.org/EventScheduled",
          location: {
            "@type": "VirtualLocation",
            url: "https://dunestats.cc/tournament",
          },
          organizer: { "@id": "https://dunestats.cc/#organization" },
          about: "Competitive Dune Imperium tournaments with ELO ratings and leaderboards.",
        }),
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { t?: number; round?: string; table?: string } => ({
    t: search.t == null ? undefined : Number(search.t),
    round: typeof search.round === "string" ? search.round : undefined,
    table: typeof search.table === "string" ? search.table : undefined,
  }),
  component: TournamentPage,
});

const SWISS_ROUNDS = ["Game 1", "Game 2", "Game 3"] as const;
const PLAYOFF_ROUNDS = ["Finals"] as const;
const TABLE_OPTIONS = [
  "Table 1",
  "Table 2",
  "Table 3",
  "Table 4",
  "Table 5",
  "Table 6",
  "Table 7",
  "Semi Final 1",
  "Semi Final 2",
  "Grand Final!",
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
  is_backup: boolean | null;
  created_at: string;
  updated_at: string;
};

/** Days from first upload of a table (min created_at) to last update (max updated_at). */
function tableDaysToFinish(rows: Row[]): number | null {
  if (!rows.length) return null;
  const created = rows.map((r) => new Date(r.created_at).getTime()).filter((n) => !isNaN(n));
  const updated = rows.map((r) => new Date(r.updated_at).getTime()).filter((n) => !isNaN(n));
  if (!created.length || !updated.length) return null;
  const days = (Math.max(...updated) - Math.min(...created)) / 86400000;
  return days < 0 ? 0 : days;
}
/** Format a score, keeping one decimal when it isn't a whole number. */
function fmtScore(n: number | string | null | undefined): string {
  if (n == null) return "\u2014";
  const v = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(v)) return String(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function fmtDays(d: number | null): string {
  if (d == null) return "—";
  if (d < 1) return "<1d";
  return `${d.toFixed(d < 10 ? 1 : 0)}d`;
}
type Shot = { tournament_num: number; round_type: string; table_identifier: string; image_url: string };

function CurrentTournament({
  tournamentNum,
  onBack,
  focusRound,
  focusTable,
}: {
  tournamentNum: number;
  onBack: () => void;
  focusRound?: string;
  focusTable?: string;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [shots, setShots] = useState<Shot[]>([]);
  const [schedules, setSchedules] = useState<MatchSchedule[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [rosterKey, setRosterKey] = useState<string | null>(null); // "round__table"
  const [loading, setLoading] = useState(true);
  const [displayMode, setDisplayMode] = useState<"player" | "discord">("player");
  const [logTab, setLogTab] = useState<"swiss" | "playoffs">("swiss");
  const [logMine, setLogMine] = useState(false);
  const [logStatus, setLogStatus] = useState<"all" | "played" | "unplayed">("all");
  const [logSort, setLogSort] = useState<"table" | "time">("table");

  const uploadRef = useRef<HTMLDivElement>(null);

  // Upload panel state (mirrors /upload but routed to tournament_matches)
  const [round, setRound] = useState<string>("Game 1");
  const [tableId, setTableId] = useState<string>("Table 1");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parsedRows, setParsedRows] = useState<
    { placement: number; player_name: string; leader_name: string; points: number }[]
  >([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [myKeys, setMyKeys] = useState<Set<string>>(new Set());
  const [board, setBoard] = useState<"base" | "uprising">("uprising");
  const [hasIx, setHasIx] = useState(false);
  const [hasEpic, setHasEpic] = useState(false);
  const [hasImmortality, setHasImmortality] = useState(false);
  const [hasBaseLeaders, setHasBaseLeaders] = useState(false);
  const [tpOpen, setTpOpen] = useState(false);
  const [heatmapKey, setHeatmapKey] = useState<string | null>(null); // "round__table"
  const heatmapNames = useMemo(() => {
    if (!heatmapKey) return [] as string[];
    const [rt, ti] = heatmapKey.split("__");
    return rows.filter((r) => r.round_type === rt && r.table_identifier === ti).map((r) => r.player_name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heatmapKey, rows]);
  const heatmapRegAvailability = useRegistrationAvailability(tournamentNum, heatmapNames);
  type SaveResult = Awaited<ReturnType<typeof saveGame>>;
  const [lastSave, setLastSave] = useState<SaveResult | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
  }, []);

  useEffect(() => {
    if (!userId) {
      setMyKeys(new Set());
      return;
    }
    void (async () => {
      const { data } = await supabase.from("player_ratings").select("player_key").eq("claimed_by", userId);
      setMyKeys(new Set((data ?? []).map((r) => r.player_key)));
    })();
  }, [userId]);

  const isMine = (name: string) => myKeys.has(name.toLowerCase().trim());
  useEffect(() => {
    if (!userId) {
      setIsAdmin(false);
      return;
    }
    void (async () => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      setIsAdmin((data ?? []).some((r) => r.role === "admin"));
    })();
  }, [userId]);
  const scheduleFor = (rt: string, ti: string) =>
    schedules.find((s) => s.round_type === rt && s.table_identifier === ti) ?? null;
  const allTournamentPlayers = useMemo(
    () => new Set(rows.filter((r) => !r.is_backup).map((r) => r.player_name.toLowerCase().trim())),
    [rows],
  );
  const champions = useChampions();
  const titles = usePlayerTitles();

  const [formatLine, setFormatLine] = useState<string | null>(null);
  const [plan, setPlan] = useState(() => bracketPlan(null));
  const [seedingMode, setSeedingMode] = useState<"snake" | "manual">("snake");
  useEffect(() => {
    void (async () => {
      const all = await fetchTournaments();
      const cfg = all.find((t) => t.tournament_num === tournamentNum);
      setFormatLine(cfg ? formatTournamentFormat(cfg) : null);
      setPlan(bracketPlan(cfg ?? null));
      setSeedingMode(cfg?.semifinal_seeding === "manual" ? "manual" : "snake");
    })();
  }, [tournamentNum]);

  const refresh = async () => {
    setLoading(true);
    const [r, s, sc] = await Promise.all([
      supabase.from("tournament_matches").select("*").eq("tournament_num", tournamentNum),
      supabase.from("tournament_table_screenshots").select("*").eq("tournament_num", tournamentNum),
      supabase.from("tournament_match_schedules").select(SCHEDULE_SELECT).eq("tournament_num", tournamentNum),
    ]);
    setRows((r.data ?? []) as Row[]);
    setShots((s.data ?? []) as Shot[]);
    // Schedules are optional — tables without a Discord schedule render normally.
    setSchedules((sc.data ?? []) as unknown as MatchSchedule[]);
    setLoading(false);
  };
  useEffect(() => {
    void refresh();
  }, []);

  // ===== TP scoring + standings =====
  const standings = useMemo(() => {
    type Agg = {
      player: string;
      discord: string;
      tp: number;
      wins: number;
      placements: number[];
      vp: number;
      vpShareSum: number;
      daysSum: number;
      daysCount: number;
    };
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
      const tDays = tableDaysToFinish(ranked);
      const tps = [
        20 + (vps[0] - vps[1]),
        Math.max(0, 15 - (vps[0] - vps[1])),
        Math.max(0, 10 - (vps[0] - vps[2])),
        Math.max(0, 5 - (vps[0] - vps[3])),
      ].map((v) => Math.max(0, v));
      ranked.forEach((r, i) => {
        // Substitutes ("backup" seats) do not score for their own standings.
        if (r.is_backup) return;
        const key = r.player_name;
        const agg = map.get(key) ?? {
          player: r.player_name,
          discord: r.discord_username ?? r.player_name,
          tp: 0,
          wins: 0,
          placements: [],
          vp: 0,
          vpShareSum: 0,
          daysSum: 0,
          daysCount: 0,
        };
        agg.tp += tps[i];
        if (r.placement === 1) agg.wins += 1;
        agg.placements.push(r.placement ?? 0);
        agg.vp += r.points ?? 0;
        agg.vpShareSum += tableVpTotal > 0 ? (r.points ?? 0) / tableVpTotal : 0;
        if (tDays != null) {
          agg.daysSum += tDays;
          agg.daysCount += 1;
        }
        if (r.discord_username) agg.discord = r.discord_username;
        map.set(key, agg);
      });
    }
    // Include unranked players with 0s so leaderboard shows everyone
    for (const row of rows) {
      if (row.is_backup) continue;
      if (!map.has(row.player_name)) {
        map.set(row.player_name, {
          player: row.player_name,
          discord: row.discord_username ?? row.player_name,
          tp: 0,
          wins: 0,
          placements: [],
          vp: 0,
          vpShareSum: 0,
          daysSum: 0,
          daysCount: 0,
        });
      }
    }
    const list = [...map.values()].map((a) => ({
      ...a,
      avgPlacement: a.placements.length ? a.placements.reduce((s, n) => s + n, 0) / a.placements.length : 4,
      vpPct: a.placements.length ? (a.vpShareSum / a.placements.length) * 100 : 0,
      avgDays: a.daysCount ? a.daysSum / a.daysCount : null,
    }));
    list.sort((a, b) => {
      if (b.tp !== a.tp) return b.tp - a.tp;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (a.avgPlacement !== b.avgPlacement) return a.avgPlacement - b.avgPlacement;
      if (b.vp !== a.vp) return b.vp - a.vp;
      if (b.vpPct !== a.vpPct) return b.vpPct - a.vpPct;
      return a.player.localeCompare(b.player);
    });
    return list;
  }, [rows]);

  // League-only standings: recompute using ONLY Swiss round rows so playoff
  // projections don't shift as Semi/Grand Final results get uploaded.
  const leagueStandings = useMemo(() => {
    type Agg = {
      player: string;
      discord: string;
      tp: number;
      wins: number;
      placements: number[];
      vp: number;
      vpShareSum: number;
      daysSum: number;
      daysCount: number;
    };
    const map = new Map<string, Agg>();
    const tables = new Map<string, Row[]>();
    for (const row of rows) {
      if (!(SWISS_ROUNDS as readonly string[]).includes(row.round_type)) continue;
      const k = `${row.round_type}__${row.table_identifier}`;
      if (!tables.has(k)) tables.set(k, []);
      tables.get(k)!.push(row);
    }
    for (const tableRows of tables.values()) {
      const ranked = tableRows
        .filter((r) => r.placement && r.points != null)
        .sort((a, b) => (a.placement ?? 9) - (b.placement ?? 9));
      if (ranked.length < 4) continue;
      const vps = ranked.map((r) => r.points ?? 0);
      const tableVpTotal = vps.reduce((s, n) => s + n, 0);
      const tDays = tableDaysToFinish(ranked);
      const tps = [
        20 + (vps[0] - vps[1]),
        Math.max(0, 15 - (vps[0] - vps[1])),
        Math.max(0, 10 - (vps[0] - vps[2])),
        Math.max(0, 5 - (vps[0] - vps[3])),
      ].map((v) => Math.max(0, v));
      ranked.forEach((r, i) => {
        // Substitutes ("backup" seats) do not score for their own standings.
        if (r.is_backup) return;
        const key = r.player_name;
        const agg = map.get(key) ?? {
          player: r.player_name,
          discord: r.discord_username ?? r.player_name,
          tp: 0,
          wins: 0,
          placements: [] as number[],
          vp: 0,
          vpShareSum: 0,
          daysSum: 0,
          daysCount: 0,
        };
        agg.tp += tps[i];
        if (r.placement === 1) agg.wins += 1;
        agg.placements.push(r.placement ?? 0);
        agg.vp += r.points ?? 0;
        agg.vpShareSum += tableVpTotal > 0 ? (r.points ?? 0) / tableVpTotal : 0;
        if (tDays != null) {
          agg.daysSum += tDays;
          agg.daysCount += 1;
        }
        if (r.discord_username) agg.discord = r.discord_username;
        map.set(key, agg);
      });
    }
    // Include every league participant (even without uploaded results) so the
    // projected playoff tables show the players currently in those positions.
    for (const row of rows) {
      if (!(SWISS_ROUNDS as readonly string[]).includes(row.round_type)) continue;
      if (row.is_backup) continue;
      if (map.has(row.player_name)) continue;
      map.set(row.player_name, {
        player: row.player_name,
        discord: row.discord_username ?? row.player_name,
        tp: 0,
        wins: 0,
        placements: [],
        vp: 0,
        vpShareSum: 0,
        daysSum: 0,
        daysCount: 0,
      });
    }
    const list = [...map.values()].map((a) => ({
      ...a,
      avgPlacement: a.placements.length ? a.placements.reduce((s, n) => s + n, 0) / a.placements.length : 4,
      vpPct: a.placements.length ? (a.vpShareSum / a.placements.length) * 100 : 0,
      avgDays: a.daysCount ? a.daysSum / a.daysCount : null,
    }));
    list.sort((a, b) => {
      if (b.tp !== a.tp) return b.tp - a.tp;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (a.avgPlacement !== b.avgPlacement) return a.avgPlacement - b.avgPlacement;
      if (b.vp !== a.vp) return b.vp - a.vp;
      if (b.vpPct !== a.vpPct) return b.vpPct - a.vpPct;
      return a.player.localeCompare(b.player);
    });
    return list;
  }, [rows]);

  const playoffs = useMemo(() => {
    const semiTables = seedSemiTables(leagueStandings, plan);
    return {
      semiTables,
      semi1: semiTables[0] ?? [],
      semi2: semiTables[1] ?? [],
      grand: leagueStandings.slice(0, plan.gf),
    };
  }, [leagueStandings, plan]);

  // Actual SF winners (placement=1 in each Semi Final table), if uploaded.
  const semiWinners = useMemo(() => {
    const winnerFor = (needle: RegExp) => {
      const row = rows.find((r) => r.round_type === "Finals" && needle.test(r.table_identifier) && r.placement === 1);
      if (!row) return null;
      return { player: row.player_name, discord: row.discord_username ?? row.player_name };
    };
    const all = Array.from({ length: Math.max(plan.tables, 2) }, (_, i) =>
      winnerFor(new RegExp(`semi\\s*final\\s*${i + 1}\\b`, "i")),
    );
    return { all, sf1: all[0] ?? null, sf2: all[1] ?? null };
  }, [rows, plan.tables]);

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

  // Auto-publish Semi Finals once League Phase is fully complete.
  const semisPublished = useMemo(
    () => rows.some((r) => r.round_type === "Finals" && /^Semi Final/i.test(r.table_identifier)),
    [rows],
  );
  const leagueComplete = useMemo(
    () => swissProgress.length > 0 && swissProgress.every((r) => r.total > 0 && r.completed === r.total),
    [swissProgress],
  );
  // Semi Final seating: automatic (snake seeded from the league standings) or
  // manual (an admin imports a CSV with the Semi Final tables, which publishes them).
  // The mode is configured per tournament in Admin → Tournaments.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seedingMode !== "snake") return;
    if (!userId || !leagueComplete || semisPublished) return;
    const tables = playoffs.semiTables;
    if (tables.length !== plan.tables || tables.length === 0) return;
    if (seededRef.current) return;
    seededRef.current = true;
    void (async () => {
      const { error } = await (supabase as any).rpc("promote_to_semifinals_n", {
        p_tournament_num: tournamentNum,
        p_tables: tables.map((t) => t.map((p) => p.player)),
      });
      if (error) {
        seededRef.current = false;
        return;
      }
      toast.success("Semi Final tables published.");
      await refresh();
    })();
  }, [seedingMode, userId, leagueComplete, semisPublished, playoffs, plan.tables, tournamentNum]);

  // Detect whether the Grand Final table already exists / has been fully scored.
  const grandFinalRows = useMemo(
    () => rows.filter((r) => r.round_type === "Finals" && /grand/i.test(r.table_identifier)),
    [rows],
  );
  const grandFinalExists = grandFinalRows.length > 0;
  const grandFinalComplete = useMemo(
    () => grandFinalRows.length >= 4 && grandFinalRows.every((r) => r.placement != null && r.points != null),
    [grandFinalRows],
  );

  // Auto-publish the Grand Final table once BOTH semi finals have a winner.
  const promoteGFRef = useRef(false);
  useEffect(() => {
    if (!userId || !semisPublished) return;
    if (grandFinalExists) return;
    const tableCount = Math.max(1, plan.tables);
    const won = semiWinners.all.slice(0, tableCount);
    if (won.length !== tableCount || won.some((w) => !w)) return;
    // Top league finishers that are not already qualified through a Semi Final win.
    const winners = won.map((w) => w!.player);
    const seatsLeft = Math.max(0, plan.gfSpots - winners.length);
    const seeds = leagueStandings
      .map((p) => p.player)
      .filter((p) => !winners.includes(p))
      .slice(0, seatsLeft);
    const players = Array.from(new Set([...seeds, ...winners]));
    if (players.length !== plan.gfSpots) return;
    if (promoteGFRef.current) return;
    promoteGFRef.current = true;
    (async () => {
      const { error } = await (supabase as any).rpc("promote_to_grandfinal", {
        p_tournament_num: tournamentNum,
        p_players: players,
      });
      if (error) {
        promoteGFRef.current = false;
        toast.error(`Could not publish the Grand Final: ${error.message}`);
        return;
      }
      toast.success("Grand Final table published.");
      await refresh();
    })();
  }, [userId, semisPublished, grandFinalExists, semiWinners, leagueStandings, plan, tournamentNum]);

  // Auto-archive the tournament to Hall of Fame once the Grand Final is scored.
  const archiveRef = useRef(false);
  useEffect(() => {
    if (!userId || !grandFinalComplete) return;
    if (archiveRef.current) return;
    archiveRef.current = true;
    const profile = tournamentModes(tournamentNum);
    (async () => {
      const { error } = await (supabase as any).rpc("archive_tournament", {
        p_tournament_num: tournamentNum,
        p_board: profile?.board_version ?? "uprising",
        p_ix: profile?.has_rise_of_ix ?? false,
        p_epic: profile?.has_epic_mode ?? false,
        p_immo: profile?.has_immortality ?? false,
      });
      if (!error) {
        toast.success(`Tournament #${tournamentNum} complete — moved to Hall of Fame.`);
        onBack();
      }
    })();
  }, [userId, grandFinalComplete, tournamentNum, onBack]);

  // ===== Standings view (Total with GF bonus vs League Phase only) =====
  const [standingsView, setStandingsView] = useState<"total" | "league">("total");

  // Total standing: uses everything, but the top-2 league finishers earned +25 TP
  // for skipping the semi finals (direct-to-Grand-Final bye bonus).
  const totalStandings = useMemo(() => {
    const grandBonus = new Set(leagueStandings.slice(0, plan.gf).map((p) => p.player));
    const boosted = standings.map((s) => (grandBonus.has(s.player) ? { ...s, tp: s.tp + 25 } : s));
    boosted.sort((a, b) => {
      if (b.tp !== a.tp) return b.tp - a.tp;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (a.avgPlacement !== b.avgPlacement) return a.avgPlacement - b.avgPlacement;
      if (b.vp !== a.vp) return b.vp - a.vp;
      if (b.vpPct !== a.vpPct) return b.vpPct - a.vpPct;
      return a.player.localeCompare(b.player);
    });
    return boosted;
  }, [standings, leagueStandings, plan.gf]);

  const displayStandings = semisPublished ? (standingsView === "total" ? totalStandings : leagueStandings) : standings;

  // Helper: get screenshot URL for a table
  const shotFor = (rt: string, ti: string) => shots.find((s) => s.round_type === rt && s.table_identifier === ti);

  // ===== Match logs grouped =====
  /** Sort key for a table: confirmed schedule time, else first upload time. */
  const tableTime = (rt: string, ti: string, players: Row[]): number => {
    const sched = scheduleFor(rt, ti);
    const when = parseScheduleTime(sched);
    if (when) return when.getTime();
    const created = players.map((p) => new Date(p.created_at).getTime()).filter((n) => !isNaN(n));
    return created.length ? Math.min(...created) : Number.POSITIVE_INFINITY;
  };

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
    // Apply the table-level filters (mine / played / unplayed)
    for (const [rt, tables] of [...byRound.entries()]) {
      for (const [ti, players] of [...tables.entries()]) {
        const played = players.filter((p) => p.placement != null && p.points != null).length >= 4;
        const statusOk = logStatus === "all" || (logStatus === "played" ? played : !played);
        const mineOk = !logMine || players.some((p) => isMine(p.player_name));
        if (!statusOk || !mineOk) tables.delete(ti);

      }
      if (tables.size === 0) byRound.delete(rt);
    }
    return byRound;
  }, [rows, logTab, logStatus, logMine, myKeys]);

  /**
   * Log sections: grouped per round for "table" sort, one flat chronological
   * list across all rounds for "time" sort.
   */
  const logSections = useMemo(() => {
    const all: { rt: string; ti: string; players: Row[] }[] = [];
    for (const [rt, tables] of groupedLogs) {
      for (const [ti, players] of tables) all.push({ rt, ti, players });
    }
    if (logSort === "time") {
      all.sort(
        (a, b) =>
          tableTime(a.rt, a.ti, a.players) - tableTime(b.rt, b.ti, b.players) ||
          a.rt.localeCompare(b.rt, undefined, { numeric: true }) ||
          a.ti.localeCompare(b.ti, undefined, { numeric: true }),
      );
      return [{ title: null as string | null, entries: all }];
    }
    const rounds = [...groupedLogs.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return rounds.map((rt) => ({
      title: rt as string | null,
      entries: all
        .filter((e) => e.rt === rt)
        .sort((a, b) => a.ti.localeCompare(b.ti, undefined, { numeric: true })),
    }));
  }, [groupedLogs, logSort, schedules]);




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
        placement: r.placement,
        player_name: r.player_name,
        leader_name: translateLeader(r.leader_name) ?? r.leader_name ?? "",
        points: r.points,
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
        if (score > bestScore) {
          bestScore = score;
          best = { round: g.round, table: g.table };
        }
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
    } finally {
      setParsing(false);
    }
  };

  const openSubmitFor = (rt: string, ti: string) => {
    setRound(rt);
    setTableId(ti);
    uploadRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Auto-scroll to a specific round/table when arriving via a deep link
  useEffect(() => {
    if (loading || !focusRound || !focusTable) return;
    if (/final/i.test(focusRound)) setLogTab("playoffs");
    else setLogTab("swiss");
    const id = `table-${focusRound.replace(/\s+/g, "-")}-${focusTable.replace(/\s+/g, "-")}`;
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [loading, focusRound, focusTable]);

  const submitResults = async () => {
    if (!userId) return toast.error("Sign in to submit results.");
    if (parsedRows.length < 4) return toast.error("Need 4 detected players.");
    if (hasEpic && !hasIx) return toast.error("Epic Mode requires Rise of Ix.");
    setSaving(true);
    try {
      const result = await submitMatch({
        userId,
        file,
        board,
        hasIx,
        hasEpic,
        hasImmortality,
        hasBaseLeaders,
        rows: parsedRows.map((r) => ({
          placement: r.placement,
          player_name: r.player_name,
          leader_name: r.leader_name || null,
          points: r.points,
        })),
        tournament: { num: tournamentNum, round, table: tableId },
        // Tournament re-uploads: same 4 scores are expected; skip the global
        // dedupe prompt so admins can re-upload without an extra click.
        confirmDuplicate: true,
      });
      if (result.status === "ok") {
        setLastSave(result.saveResult);
        toast.success(
          result.tournamentApplied
            ? "Results submitted to tournament + global leaderboard!"
            : "Global leaderboard updated (tournament write skipped).",
        );
      }
      setFile(null);
      setPreview(null);
      setParsedRows([]);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <Button variant="ghost" size="sm" onClick={onBack} className="text-sand hover:text-sand -mb-4">
        <ArrowLeft className="size-4 mr-1" /> Back to Current Tournaments
      </Button>
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h2 className="font-display text-3xl flex items-center gap-2 flex-wrap">
            <Trophy className="size-7 text-sand" /> Live Tournament #{tournamentNum}
            <TournamentPlayModeBadge num={tournamentNum} size={20} />
          </h2>

          <p className="text-muted-foreground">{playModeDescription(tournamentNum)}</p>
          {formatLine && (
            <p className="mt-2 inline-flex items-center gap-2 rounded-md border border-sand/40 bg-sand/10 px-3 py-1.5 text-xs text-sand">
              <Sword className="size-3.5" /> {formatLine}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() => uploadRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="border-sand/60 text-sand hover:bg-sand/10"
          >
            <UploadIcon className="size-4 mr-1" /> Upload now
          </Button>
          <Label className="text-xs text-muted-foreground">Display:</Label>
          <span className={displayMode === "player" ? "text-sand" : "text-muted-foreground text-sm"}>Direwolf</span>
          <Switch
            checked={displayMode === "discord"}
            onCheckedChange={(c) => setDisplayMode(c ? "discord" : "player")}
          />
          <span className={displayMode === "discord" ? "text-sand" : "text-muted-foreground text-sm"}>Discord</span>
        </div>
      </header>

      <Dialog open={tpOpen} onOpenChange={setTpOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Tournament Points (TP) <HelpCircle className="size-5 text-coral" />
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground pt-2 space-y-3">
              <p>
                Your final Tournament Points (TP) are based on how you finish, adjusted by how close everyone was to the
                winner's score:
              </p>
              <p>
                <strong>1st Place (Base: 20 TP):</strong> Earns an extra +1 TP for every Victory Point they win by ahead
                of 2nd place.
              </p>
              <p>
                <strong>2nd, 3rd, &amp; 4th Place (Base: 15, 10, 5 TP):</strong> Lose -1 TP for every Victory Point they
                fall behind the winner (clamped to a minimum of 0).
              </p>
              <p className="text-sand font-medium">
                In short: Winning by a lot gives you a massive bonus. If you lose, keeping the score close saves your
                tournament rank!
              </p>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-sand" />
        </div>
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
                  <div className="h-full bg-sand transition-all duration-500" style={{ width: `${p.pct}%` }} />
                </div>
              </Card>
            ))}
          </div>

          {/* Standings */}
          <Card className="p-6 border-border/60 bg-card/70 shadow-arena">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <h3 className="font-display text-xl">Live Standings</h3>
              {semisPublished && (
                <Tabs value={standingsView} onValueChange={(v) => setStandingsView(v as "total" | "league")}>
                  <TabsList>
                    <TabsTrigger value="total">Total (with GF bonus)</TabsTrigger>
                    <TabsTrigger value="league">League Phase Only</TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
            </div>
            {semisPublished && (
              <p className="text-xs text-muted-foreground mb-3 italic">
                {standingsView === "total"
                  ? "Total standing includes all games. Players who finished top-2 in the league phase get +25 TP for their direct-to-Grand-Final bye."
                  : "League phase standing only counts the three Swiss games."}
              </p>
            )}
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
                    <th className="text-right py-2 px-2" title="Average days to finish per table">
                      D2F
                    </th>
                    <th className="text-left py-2 px-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {displayStandings.map((s, i) => {
                    const rank = i + 1;
                    const grandKeys = new Set(playoffs.grand.map((p) => p.player));
                    const gold = grandKeys.has(s.player);
                    const silver = !gold && rank > plan.gf && rank <= plan.gf + plan.semi;
                    const mine = isMine(s.player);
                    return (
                      <tr
                        key={s.player}
                        className={`border-b border-border/20 ${mine ? "bg-sand/15 ring-2 ring-sand" : gold ? "bg-amber-500/10 ring-1 ring-amber-400/60" : silver ? "bg-slate-400/5 ring-1 ring-slate-400/40" : ""}`}
                      >
                        <td className="py-2 px-2 font-mono">{rank}</td>
                        <td className="py-2 px-2 font-medium">
                          <Link
                            to="/players/$key"
                            params={{ key: s.player.toLowerCase().trim() }}
                            className="hover:underline underline-offset-2 transition-colors"
                            style={{ color: colorForKey(titles, s.player) }}
                          >
                            {displayMode === "discord" ? s.discord : s.player}
                          </Link>
                          {isChampion(champions, s.player) && (
                            <Trophy
                              className="inline size-4 text-sand ml-1 -mt-0.5"
                              aria-label="Hall of Fame Champion"
                            />
                          )}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-sand">{s.tp}</td>
                        <td className="py-2 px-2 text-right font-mono">{s.wins}</td>
                        <td className="py-2 px-2 text-right font-mono">
                          {s.placements.length ? s.avgPlacement.toFixed(2) : "—"}
                        </td>
                        <td className="py-2 px-2 text-right font-mono">{s.vp}</td>
                        <td className="py-2 px-2 text-right font-mono">
                          {s.placements.length ? `${s.vpPct.toFixed(1)}%` : "—"}
                        </td>
                        <td className="py-2 px-2 text-right font-mono">{s.placements.length}</td>
                        <td className="py-2 px-2 text-right font-mono text-muted-foreground">{fmtDays(s.avgDays)}</td>
                        <td className="py-2 px-2 text-xs">
                          {gold && <Badge className="bg-amber-500/80 text-black">Direct to Grand Finals</Badge>}
                          {silver && (
                            <Badge variant="outline" className="border-slate-300/60 text-slate-200">
                              Qualified for Semi Finals
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Playoff bracket — projections only while the Semi Finals aren't published yet */}
          {!semisPublished &&
            (() => {
              const rankOf = new Map(leagueStandings.map((p, i) => [p.player, i + 1]));
              const label = (p: { player: string; discord: string }) => {
                const name = displayMode === "discord" ? p.discord : p.player;
                const r = rankOf.get(p.player);
                return r ? `${name} (#${r})` : name;
              };
              return (
                <>
                  <Card className="p-4 border-border/60 bg-card/70 shadow-arena">
                    <h3 className="font-display text-lg">Semi Final seating</h3>
                    <p className="text-xs text-muted-foreground">
                      {seedingMode === "snake" ? (
                        <>
                          <span className="text-sand">Automatic (snake seeding)</span> — tables are built from the
                          league standings (1-8-9-16, 2-7-10-15, …) as soon as the league phase is finished.
                        </>
                      ) : (
                        <>
                          <span className="text-sand">Manual seating</span> — the Semi Final tables are published by the
                          organisers once seating is decided.
                        </>
                      )}
                    </p>
                  </Card>
                  <p className="text-xs text-muted-foreground italic">
                    {seedingMode === "snake"
                      ? "Projected Semi Finals based on current standings."
                      : "Semi Final tables will appear once the organisers publish the seating."}
                  </p>
                  {seedingMode === "snake" && (
                    <div className="grid md:grid-cols-3 gap-4">
                      {playoffs.semiTables.map((t, i) => (
                        <BracketCard key={i} title={`Semi Final ${i + 1}`} players={t.map(label)} accent="slate" />
                      ))}
                      <BracketCard
                        title="Grand Final!"
                        players={[
                          ...playoffs.grand.slice(0, Math.max(0, plan.gfSpots - plan.tables)).map(label),
                          ...Array.from({ length: Math.min(plan.tables, plan.gfSpots) }, (_, i) => `Winner SF${i + 1}`),
                        ]}
                        accent="amber"
                      />
                    </div>
                  )}
                </>
              );
            })()}

          {/* Match logs */}
          <Card className="p-6 border-border/60 bg-card/70 shadow-arena">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <h3 className="font-display text-xl">Match Logs</h3>
              <div className="flex items-center gap-2 flex-wrap text-[11px]">
                {userId && (
                  <button
                    type="button"
                    onClick={() => setLogMine((v) => !v)}
                    className={`rounded-full border px-2.5 py-1 transition ${
                      logMine
                        ? "border-sand bg-sand/20 text-sand"
                        : "border-border/60 text-muted-foreground hover:text-sand"
                    }`}
                  >
                    Only my games
                  </button>
                )}
                <div className="inline-flex rounded-full border border-border/60 overflow-hidden">
                  {(["all", "played", "unplayed"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setLogStatus(s)}
                      className={`px-2.5 py-1 capitalize transition ${
                        logStatus === s ? "bg-sand/20 text-sand" : "text-muted-foreground hover:text-sand"
                      }`}
                    >
                      {s === "all" ? "Both" : s}
                    </button>
                  ))}
                </div>
                <div className="inline-flex rounded-full border border-border/60 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setLogSort("table")}
                    className={`px-2.5 py-1 transition ${
                      logSort === "table" ? "bg-sand/20 text-sand" : "text-muted-foreground hover:text-sand"
                    }`}
                  >
                    Game &amp; table
                  </button>
                  <button
                    type="button"
                    onClick={() => setLogSort("time")}
                    className={`px-2.5 py-1 transition ${
                      logSort === "time" ? "bg-sand/20 text-sand" : "text-muted-foreground hover:text-sand"
                    }`}
                  >
                    {tournamentPlayMode(tournamentNum) === "live" ? "Scheduled date" : "Start time"}
                  </button>
                </div>
              </div>
            </div>
            <Tabs value={logTab} onValueChange={(v) => setLogTab(v as "swiss" | "playoffs")}>
              <TabsList>
                <TabsTrigger value="swiss">League Phase</TabsTrigger>
                <TabsTrigger value="playoffs">Finals</TabsTrigger>
              </TabsList>
              <TabsContent value={logTab} className="mt-4 space-y-6">
                {groupedLogs.size === 0 && (
                  <p className="text-sm text-muted-foreground">No matches match the current filters.</p>
                )}
                {logSections
                  .map((section, si) => (
                    <div
                      key={section.title ?? "chrono"}
                      id={section.title ? `round-${section.title.replace(/\s+/g, "-")}` : `chrono-${si}`}
                      className="scroll-mt-24"
                    >
                      {section.title && (
                        <h4 className="font-display text-lg text-sand mb-2">{section.title}</h4>
                      )}
                      <div className="grid md:grid-cols-2 gap-3">
                        {section.entries
                          .map(({ rt, ti, players }) => {

                            const shot = shotFor(rt, ti);
                            const sorted = [...players].sort((a, b) => (a.placement ?? 9) - (b.placement ?? 9));
                            const finished = players.filter((p) => p.placement != null && p.points != null).length >= 4;
                            const tDays = finished ? tableDaysToFinish(players) : null;
                            const sched = scheduleFor(rt, ti);
                            const canStart = isAdmin || players.some((p) => isMine(p.player_name));
                            return (
                              <div
                                key={`${rt}__${ti}`}
                                id={`table-${rt.replace(/\s+/g, "-")}-${ti.replace(/\s+/g, "-")}`}
                                className={`border rounded-md p-3 bg-background/40 scroll-mt-24 transition-colors ${
                                  focusRound === rt && focusTable === ti
                                    ? "border-sand ring-2 ring-sand/60"
                                    : "border-border/40"
                                }`}
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Link
                                      to="/tournament/$num/$table"
                                      params={{ num: String(tournamentNum), table: tableSlug(rt, ti) }}
                                      className="font-medium hover:text-sand underline-offset-4 hover:underline transition"
                                    >
                                      {rt} · {ti}
                                    </Link>

                                    {isAdmin && (
                                      <button
                                        type="button"
                                        onClick={() => setRosterKey(`${rt}__${ti}`)}
                                        title="Edit roster"
                                        className="text-muted-foreground hover:text-sand transition"
                                      >
                                        <Pencil className="size-3.5" />
                                      </button>
                                    )}
                                    <TableScheduleControls
                                      schedule={sched}
                                      finished={finished}
                                      canStart={canStart}
                                      title={`Dune Imperium · ${rt} · ${ti}`}
                                      onChanged={refresh}
                                    />
                                    {(players[0]?.table_score != null ||
                                      players.some((p) => (p.player_availability?.length ?? 0) > 0)) && (
                                      <button
                                        type="button"
                                        onClick={() => setHeatmapKey(`${rt}__${ti}`)}
                                        className="inline-flex items-center gap-1 rounded-full border border-sand/40 bg-sand/15 px-2 py-0.5 text-[11px] text-sand hover:bg-sand/25 transition"
                                        title="Open the availability map for this table"
                                      >
                                        📅 Availability Map
                                        {players[0]?.table_score != null &&
                                          ` (Score: ${fmtScore(players[0].table_score)})`}
                                      </button>
                                    )}


                                    {tDays != null && (
                                      <span
                                        className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground"
                                        title="Days from first upload of this table to last update"
                                      >
                                        ⏱ {fmtDays(tDays)}
                                      </span>
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
                                    <Button size="sm" variant="outline" onClick={() => openSubmitFor(rt, ti)}>
                                      Submit Table Results
                                    </Button>
                                  )}
                                </div>
                                <ul className="space-y-1 text-sm">
                                  {sorted.map((p) => (
                                    <li
                                      key={p.id}
                                      className={`flex justify-between gap-2 px-2 py-0.5 rounded ${isMine(p.player_name) ? "bg-sand/15 ring-1 ring-sand/60" : ""}`}
                                    >
                                      <span>
                                        <span className="font-mono text-muted-foreground mr-2">
                                          {p.placement ?? "—"}
                                        </span>
                                        {displayMode === "discord"
                                          ? (p.discord_username ?? p.player_name)
                                          : p.player_name}
                                        {p.is_backup && (
                                          <span
                                            className="ml-2 inline-flex items-center rounded-full border border-sky-500/40 bg-sky-500/10 px-1.5 text-[10px] text-sky-300"
                                            title="Backup player — this result does not count toward their own standings"
                                          >
                                            🛡️ Backup
                                          </span>
                                        )}
                                      </span>
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
              <h3 className="font-display text-2xl">Submit Table Results</h3>
            </div>
            <p className="text-muted-foreground mb-6 text-sm">
              Drop your Dune Imperium Digital end-screen screenshot — Round &amp; Table auto-detect from the detected
              players. Confirm the board version + expansions, then submit.
            </p>
            {!userId && <p className="text-coral text-sm mb-3">Sign in to submit results.</p>}

            <div className="grid lg:grid-cols-2 gap-6">
              <Card className="p-6 border-border/60 bg-card/70 shadow-arena">
                <div className="space-y-4">
                  <div>
                    <Label>Screenshot</Label>
                    <label
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const f = e.dataTransfer.files?.[0];
                        if (f && f.type.startsWith("image/")) void onFile(f);
                      }}
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
                      <Input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
                      />
                    </label>
                    <div className="mt-3 flex items-start gap-3 rounded-md border border-border/50 bg-background/30 p-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <button type="button" className="relative group shrink-0">
                            <img
                              src={exampleMatch.url}
                              alt="Example end-screen"
                              className="h-20 w-auto rounded border border-border/60 group-hover:border-sand transition"
                            />
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
                      <Label className="mb-2 block">
                        Board version <span className="text-coral">*</span>
                      </Label>
                      <RadioGroup
                        value={board}
                        onValueChange={(v) => setBoard(v as "base" | "uprising")}
                        className="grid grid-cols-2 gap-2"
                      >
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
                          <Checkbox
                            checked={hasIx}
                            onCheckedChange={(c) => {
                              setHasIx(!!c);
                              if (!c) setHasEpic(false);
                            }}
                          />
                          Rise of Ix
                        </label>
                        <label
                          className={`flex items-center gap-2 ${hasIx ? "cursor-pointer" : "opacity-40 cursor-not-allowed"}`}
                        >
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
                <h4 className="font-display text-lg mb-3">Detected results</h4>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div>
                    <Label className="text-xs">Tournament</Label>
                    <Select value={String(tournamentNum)} disabled>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={String(tournamentNum)}>{tournamentNum}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Round Type</Label>
                    <Select value={round} onValueChange={setRound}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[...SWISS_ROUNDS, ...PLAYOFF_ROUNDS].map((r) => (
                          <SelectItem key={r} value={r}>
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Table</Label>
                    <Select value={tableId} onValueChange={setTableId}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TABLE_OPTIONS.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
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
                    {parsedRows
                      .slice()
                      .sort((a, b) => a.placement - b.placement)
                      .map((r, i) => (
                        <li
                          key={i}
                          className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_44px] gap-2 items-center rounded-md px-1 py-1.5"
                        >
                          <span className="font-display text-sand text-sm w-4 text-center tabular-nums">
                            {r.placement}
                          </span>
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
                  {saving ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Submitting…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="size-4" /> Submit to {round} · {tableId}
                    </>
                  )}
                </Button>
              </Card>
            </div>

            {lastSave && (
              <Card className="p-4 mt-6 border-sand/40 bg-card/70">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="size-5 text-emerald-400" />
                  <h4 className="font-display text-lg">Match saved</h4>
                  <TournamentTag num={lastSave.tournament_num} />
                </div>
                <ul className="space-y-1 text-sm">
                  {[...lastSave.deltas]
                    .sort((a, b) => a.placement - b.placement)
                    .map((d, i) => (
                      <li key={i} className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex size-5 items-center justify-center rounded bg-secondary/60 text-[10px] font-bold">
                          {d.placement}
                        </span>
                        <span className="font-medium">{d.player_name}</span>
                        <EloDeltaLine
                          version={lastSave.game_version}
                          overall={d.overall_delta}
                          versionDelta={d.version_delta}
                        />
                      </li>
                    ))}
                </ul>
              </Card>
            )}
          </div>
        </>
      )}
      {rosterKey &&
        (() => {
          const [rt, ti] = rosterKey.split("__");
          const seats = rows
            .filter((r) => r.round_type === rt && r.table_identifier === ti)
            .sort((a, b) => (a.placement ?? 9) - (b.placement ?? 9))
            .map((r) => ({
              id: r.id,
              player_name: r.player_name,
              discord_username: r.discord_username,
              is_backup: r.is_backup,
            }));
          return (
            <RosterEditDialog
              open={true}
              onOpenChange={(v) => {
                if (!v) setRosterKey(null);
              }}
              tournamentNum={tournamentNum}
              roundType={rt}
              tableIdentifier={ti}
              seats={seats}
              existingPlayers={allTournamentPlayers}
              onSaved={refresh}
            />
          );
        })()}
      {heatmapKey &&
        (() => {
          const [rt, ti] = heatmapKey.split("__");
          const tableRows = rows.filter((r) => r.round_type === rt && r.table_identifier === ti);
          const players: HeatmapPlayer[] = withRegistrationAvailability(
            tableRows.map((r) => ({
              player_name: r.player_name,
              discord_username: r.discord_username,
              player_compatibility_score: r.player_compatibility_score,
              player_availability: r.player_availability,
            })),
            heatmapRegAvailability,
          );
          return (
            <AvailabilityHeatmap
              open={true}
              onOpenChange={(v) => {
                if (!v) setHeatmapKey(null);
              }}
              tableId={`${rt} · ${ti}`}
              matchQuality={tableRows[0]?.table_score ?? null}
              players={players}
              suggestedSlots={scheduleFor(rt, ti)?.suggested_slots}
              myPlayerName={tableRows.find((r) => isMine(r.player_name))?.player_name ?? null}
              playMode={tournamentPlayMode(tournamentNum)}
              registerTournamentNum={tournamentNum}
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
        {players.map((p, i) => (
          <li key={i} className="font-mono">
            {i + 1}. {p}
          </li>
        ))}
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
      setUrl(await signedUrlOrR2("match-screenshots", path, 3600));
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <button className="text-sand hover:text-sand/80" title="View screenshot">
            <ImageIcon className="size-4" />
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl p-2 bg-background/95 backdrop-blur-md">
        {url ? (
          <SupabaseImage
            bucket="match-screenshots"
            src={url}
            alt="Screenshot"
            className="w-full h-auto rounded max-h-[80vh] object-contain"
          />
        ) : (
          <div className="flex justify-center py-12">
            <Loader2 className="size-6 animate-spin" />
          </div>
        )}
        <div className="flex justify-end mt-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result);
      resolve(s.includes(",") ? s.split(",")[1] : s);
    };
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
    { id: "future", title: "Future Tournaments", subtitle: "Register Now", icon: <Calendar className="size-5" /> },
    {
      id: "current",
      title: "Current Tournaments",
      subtitle: "Active Battlegrounds",
      icon: <Sword className="size-5" />,
    },
    { id: "previous", title: "Previous Tournaments", subtitle: "Hall of Fame", icon: <History className="size-5" /> },
  ];

  // animate-in slide direction: moving to higher idx → enter from right; lower idx → enter from left
  const slideClass =
    dir >= 0
      ? "animate-in slide-in-from-right-10 fade-in duration-300"
      : "animate-in slide-in-from-left-10 fade-in duration-300";

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        <header className="mb-6 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-display text-3xl flex items-center gap-2">
              <Trophy className="size-7 text-sand" /> Tournaments
            </h1>
            <p className="text-muted-foreground text-sm">Current, future, and past Strategy Arena cycles.</p>
          </div>
          <AdminTournamentsLink />
        </header>

        <div className="mb-8">
          <CheckinBanner />
        </div>

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
          {tab === "current" && <CurrentTournamentsHub />}
          {tab === "previous" && <PreviousTournaments />}
        </div>
      </div>
    </div>
  );
}

function FutureTournaments() {
  const [open, setOpen] = useState<TournamentConfig[] | null>(null);
  const [registered, setRegistered] = useState<Set<number>>(new Set());

  useEffect(() => {
    void (async () => setOpen(await fetchOpenTournaments()))();
  }, []);

  useEffect(() => {
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;
      const { data } = await supabase.from("tournament_registrations").select("tournament_num").eq("user_id", uid);
      setRegistered(new Set((data ?? []).map((r) => r.tournament_num)));
    })();
  }, []);

  if (open === null) {
    return (
      <Card className="p-6 border-sand/40 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="size-4 animate-spin" /> Loading tournaments…
      </Card>
    );
  }

  if (open.length === 0) {
    return (
      <div className="space-y-6">
        <Card className="p-6 border-sand/40">
          <h2 className="font-display text-xl mb-1">No open registrations</h2>
          <p className="text-sm text-muted-foreground">
            There are no tournaments open for registration right now. Check the Discord or come back soon.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl mb-1">Open for registration</h2>
        <p className="text-sm text-muted-foreground">
          {open.length} tournament{open.length === 1 ? "" : "s"} currently accepting registrations.
        </p>
      </div>

      {open.map((t) => (
        <Card
          key={t.tournament_num}
          className="p-6 sm:p-8 border-sand/40 bg-gradient-to-br from-card via-card to-card/40 space-y-4"
        >
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <Trophy className="size-6 text-sand" />
              <div>
                <h3 className="font-display text-2xl">{t.info_title?.trim() || t.name}</h3>
                <p className="text-xs text-muted-foreground">
                  Tournament #{t.tournament_num} · {formatLongDate(t.start_date)} → {formatLongDate(t.end_date)} (
                  {tournamentDayCount(t)} days)
                </p>
              </div>
            </div>
            <Button
              asChild
              className={
                registered.has(t.tournament_num)
                  ? "bg-emerald-600 text-white hover:bg-emerald-600/90"
                  : "bg-sand text-background hover:bg-sand/90"
              }
            >
              <Link to="/tournament-register" search={{ t: t.tournament_num }}>
                {registered.has(t.tournament_num) ? "Registered! Adjust your registration" : "Register now"}
              </Link>
            </Button>
          </div>

          <ModeBadges
            flags={{
              hasIx: t.has_rise_of_ix,
              hasEpic: t.has_epic_mode,
              hasImmo: t.has_immortality,
              hasUprising: t.board_version === "uprising",
            }}
            size={20}
          />

          <PrizesInfo summary={t.prizes_summary} details={t.prizes_text} />

          <TruncatedInfoText text={t.info_text} />

          <div className="text-xs text-muted-foreground">
            Check-in opens {checkinStart(t).toLocaleString()} · Tournament starts 24 hours later · Minimum availability{" "}
            {t.required_availability_pct}% overall and {t.required_weekly_pct}% per week
          </div>
        </Card>
      ))}
    </div>
  );
}

type TournamentSummaryCard = {
  num: number;
  title: string;
  subtitle: string;
  modes: { hasIx: boolean; hasEpic: boolean; hasImmo: boolean; hasUprising: boolean };
  progressPct: number;
  totalCells: number;
  completedCells: number;
  phase: string;
};

async function fetchActiveTournamentNums(): Promise<number[]> {
  const { data } = await supabase.from("tournament_matches").select("tournament_num");
  const nums = new Set<number>((data ?? []).map((r) => (r as { tournament_num: number }).tournament_num));
  return [...nums].sort((a, b) => a - b);
}

function CurrentTournamentsHub() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [selected, setSelected] = useState<number | null>(search.t ?? null);
  const [cards, setCards] = useState<TournamentSummaryCard[] | null>(null);

  useEffect(() => {
    if (search.t != null && search.t !== selected) setSelected(search.t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.t]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      await loadTournamentModes();
      const summaries: TournamentSummaryCard[] = [];
      const activeNums = await fetchActiveTournamentNums();
      for (const num of activeNums) {
        const { data } = await supabase
          .from("tournament_matches")
          .select("placement, points, round_type, table_identifier")
          .eq("tournament_num", num);
        const rows = (data ?? []) as {
          placement: number | null;
          points: number | null;
          round_type: string;
          table_identifier: string;
        }[];
        const tables = new Map<string, { filled: number }>();
        for (const r of rows) {
          const key = `${r.round_type}__${r.table_identifier}`;
          const t = tables.get(key) ?? { filled: 0 };
          if (r.placement != null && r.points != null) t.filled += 1;
          tables.set(key, t);
        }
        const completed = [...tables.values()].filter((t) => t.filled >= 4).length;
        const hasGrand = rows.some((r) => /grand/i.test(r.table_identifier));
        const grandComplete = rows.some((r) => /grand/i.test(r.table_identifier) && r.placement != null);
        const hasSemi = rows.some((r) => /semi/i.test(r.table_identifier));
        // Expected bracket size: published tables + the finals tables still to come.
        let total = tables.size;
        if (hasSemi && !hasGrand) total += 1; // Grand Final still to be published
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
        const phase = grandComplete
          ? "Champion Crowned"
          : hasGrand
            ? "Grand Finals"
            : hasSemi
              ? "Semi Finals"
              : "League Phase";
        const profile = tournamentModes(num);
        summaries.push({
          num,
          title: `Tournament #${num}`,
          subtitle: profile?.subtitle ?? "Uprising\u00a0",
          modes: {
            hasIx: profile?.has_rise_of_ix ?? false,
            hasEpic: profile?.has_epic_mode ?? false,
            hasImmo: profile?.has_immortality ?? false,
            hasUprising: (profile?.board_version ?? "uprising") === "uprising",
          },
          progressPct: pct,
          totalCells: total,
          completedCells: completed,
          phase,
        });
      }
      if (!cancelled) setCards(summaries.filter((c) => c.totalCells > 0));
    };
    void load();
    const onFocus = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  if (selected != null) {
    return (
      <CurrentTournament
        tournamentNum={selected}
        focusRound={search.round}
        focusTable={search.table}
        onBack={() => {
          setSelected(null);
          void navigate({ search: { t: undefined, round: undefined, table: undefined } });
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="font-display text-3xl flex items-center gap-2">
          <Sword className="size-7 text-sand" /> Active Tournaments
        </h2>
        <p className="text-muted-foreground text-sm">Two concurrent cycles are live. Pick one to jump in.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(cards ?? []).map((c) => {
          const live = tournamentPlayMode(c.num) === "live";
          return (
          <button
            key={c.num}
            onClick={() => setSelected(c.num)}
            className={`text-left group rounded-xl border bg-card/50 hover:bg-card transition-all p-5 focus:outline-none focus-visible:ring-2 ${
              live
                ? "border-teal/40 hover:border-teal focus-visible:ring-teal"
                : "border-coral/40 hover:border-coral focus-visible:ring-coral"
            }`}
          >
            <div className="flex items-center gap-4">
              <div
                className={`relative flex items-center justify-center size-16 rounded-full border shadow-inner ${
                  live ? "bg-teal/10 border-teal/40" : "bg-coral/10 border-coral/40"
                }`}
              >
                <Trophy className={`size-7 ${live ? "text-teal" : "text-coral"}`} />
                <span
                  className={`absolute -bottom-1 -right-1 inline-flex items-center justify-center size-7 rounded-full bg-background font-display text-sm border ${
                    live ? "text-teal border-teal/60" : "text-coral border-coral/60"
                  }`}
                >
                  {c.num}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-display text-xl leading-tight">{c.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{c.subtitle}</div>
                <div className="mt-2 text-[11px] uppercase tracking-wide text-sand/80">{c.phase}</div>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <TournamentPlayModeBadge num={c.num} />
              <ModeBadges flags={c.modes} size={22} />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">{playModeDescription(c.num)}</p>

            <div className="mt-4">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">Progress</span>
                <span className="text-sand font-mono">
                  {c.completedCells}/{c.totalCells} · {c.progressPct}%
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${live ? "bg-teal" : "bg-coral"}`}
                  style={{ width: `${c.progressPct}%` }}
                />
              </div>
            </div>
            <div
              className={`mt-3 text-[11px] uppercase tracking-wide opacity-0 group-hover:opacity-100 transition-opacity ${
                live ? "text-teal" : "text-coral"
              }`}
            >
              VIEW TOURNAMENT →
            </div>
          </button>
          );
        })}

        {cards === null && (
          <div className="col-span-full flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading tournaments…
          </div>
        )}
      </div>
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

function configBadge(r: {
  board_version: string;
  has_rise_of_ix: boolean;
  has_epic_mode: boolean;
  has_immortality: boolean;
}): string {
  if (r.board_version === "uprising") {
    return r.has_immortality ? "Uprising + Immortality" : "Uprising Base";
  }
  const ix = r.has_rise_of_ix,
    ep = r.has_epic_mode,
    im = r.has_immortality;
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
        <span
          key={it.key}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-background/40 border border-border/60 rounded-full pl-1 pr-2 py-0.5"
        >
          <img
            src={it.src}
            alt={it.label}
            width={size}
            height={size}
            className="rounded-full"
            style={{ width: size, height: size }}
          />
          <span>{it.label}</span>
        </span>
      ))}
    </div>
  );
}

function PlayerLink({ name, className }: { name: string; className?: string }) {
  const key = name.toLowerCase().trim();
  const titles = usePlayerTitles();
  return (
    <Link
      to="/players/$key"
      params={{ key }}
      className={className ?? "hover:underline underline-offset-2"}
      style={{ color: colorForKey(titles, key) }}
    >
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
          .select(
            "id, tournament_num, round_type, table_identifier, player_name, leader_name, points, placement, board_version, has_rise_of_ix, has_epic_mode, has_immortality",
          )
          .order("tournament_num", { ascending: false })
          .order("round_type")
          .order("table_identifier")
          .order("placement")
          .range(from, from + page - 1);
        if (error) {
          console.error(error);
          break;
        }
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
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading archive…
      </div>
    );
  }

  if (selected != null) {
    const t = tournaments.find((x) => x.num === selected);
    if (!t) {
      setSelected(null);
      return null;
    }
    return <TournamentDeepDive tournament={t} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="space-y-8">
      <header>
        <h2 className="font-display text-3xl flex items-center gap-2">
          <Trophy className="size-7 text-sand" /> Hall of Fame
        </h2>
        <p className="text-muted-foreground text-sm">
          Twelve tournaments. Twelve champions. Tap any trophy to open the full bracket.
        </p>
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

  const grandFinalKey = useMemo(() => [...finalsByTable.keys()].find((k) => /grand/i.test(k)) ?? null, [finalsByTable]);
  const semiKeys = useMemo(
    () =>
      [...finalsByTable.keys()]
        .filter((k) => /semi/i.test(k))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
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
    for (const inner of m.values()) for (const arr of inner.values()) arr.sort((a, b) => a.placement - b.placement);
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
      .map((a) => ({
        ...a,
        avg: a.placements.length ? a.placements.reduce((s, n) => s + n, 0) / a.placements.length : 0,
      }))
      .sort((a, b) => b.tp - a.tp || b.wins - a.wins || a.avg - b.avg || b.vp - a.vp);
  }, [rows]);

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={onBack} className="text-sand hover:text-sand">
        <ArrowLeft className="size-4 mr-1" /> Back to Hall of Fame
      </Button>

      <h2 className="font-display text-3xl text-sand flex items-center gap-2">
        <Trophy className="size-7 text-sand" /> Tournament #{num}
      </h2>

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
            <div className="mt-3">
              <ModeBadges flags={modes} size={24} />
            </div>
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

function BracketTable({
  title,
  rows,
  accent,
  compact,
}: {
  title: string;
  rows: PastRow[];
  accent?: boolean;
  compact?: boolean;
}) {
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
              <TableCell className={`text-muted-foreground text-xs ${compact ? "py-1" : ""}`}>
                {r.leader_name ?? "—"}
              </TableCell>
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
        ranked.forEach((r, i) => {
          ensure(r.player_name).tp += tps[i];
        });
      }
      for (const p of playersInT) ensure(p).played += 1;
      for (const p of semi) ensure(p).semiFinals += 1;
      for (const p of grand) ensure(p).grandFinals += 1;
      const winnerRow = t.rows.find(
        (r) => r.round_type === "Finals" && /grand/i.test(r.table_identifier) && r.placement === 1,
      );
      if (winnerRow) ensure(winnerRow.player_name).wins += 1;
    }
    return [...m.values()];
  }, [tournaments]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const arr = needle ? lifetime.filter((r) => r.player.toLowerCase().includes(needle)) : lifetime;
    const valOf = (r: LifetimeAgg): number => {
      switch (sortKey) {
        case "wins":
          return r.wins;
        case "grandFinals":
          return r.grandFinals;
        case "semiFinals":
          return r.semiFinals;
        case "played":
          return r.played;
        case "tp":
          return r.tp;
        case "tpPer":
          return r.played ? r.tp / r.played : 0;
      }
    };
    const sorted = [...arr].sort((a, b) => {
      const av = valOf(a),
        bv = valOf(b);
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
            if (!active) {
              setSortKey(key);
              setSortDir("desc");
              return;
            }
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
          <h3 className="font-display text-2xl text-sand flex items-center gap-2">
            <Trophy className="size-5" /> Lifetime Hall of Fame
          </h3>
          <p className="text-xs text-muted-foreground">Aggregated across every archived tournament.</p>
        </div>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search player…" className="max-w-xs" />
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
                <TableCell colSpan={7} className="text-center text-muted-foreground italic py-6">
                  No players match.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </section>
  );
}
