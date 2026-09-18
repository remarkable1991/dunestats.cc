import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

import { leaderRouteFor } from "@/lib/leader-slug";
import { useEffect, useMemo, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { GAME_VERSIONS, type GameVersion } from "@/lib/game-version";
import { LEADERS, classifyLeader } from "@/lib/leaders";
import { influenceEfficiency, FACTION_KEYS, FACTION_ALLIANCE_KEYS, FACTION_LEVEL_KEYS, type FactionKey } from "@/lib/match-telemetry";
import { BarChart3, ArrowUp, ArrowDown, ArrowUpDown, UserCheck, FlaskConical, HelpCircle, Users, Crown, Timer, Landmark, Swords } from "lucide-react";

/** Map non-English / variant scan reads of a conflict to its canonical English title. */
const CONFLICT_ALIASES: Record<string, string> = {
  "suprématie économique": "Economic Supremacy",
  "suprematie economique": "Economic Supremacy",
  "bataille pour le bassin impérial": "Battle for Imperial Basin",
  "bataille pour le bassin imperial": "Battle for Imperial Basin",
  "bataille pour arrakeen": "Battle for Arrakeen",
  "bataille pour carthag": "Battle for Carthag",
  "bataille pour la raffinerie d'épice": "Battle for Spice Refinery",
  "bataille pour la raffinerie d'epice": "Battle for Spice Refinery",
};

function titleCaseConflict(raw: string) {
  const small = new Set(["for", "of", "the", "and", "a", "an", "in", "to", "vs"]);
  const normalized = raw.trim().replace(/\s+/g, " ").toLowerCase();
  const alias = CONFLICT_ALIASES[normalized];
  const base = alias ?? normalized;
  return base
    .split(" ")
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

type TriState = "any" | "true" | "false";

const FACTION_LABEL: Record<FactionKey, string> = {
  emperor: "Emperor",
  spacing_guild: "Spacing Guild",
  bene_gesserit: "Bene Gesserit",
  fremen: "Fremen",
};


function TriSelect({ label, value, onChange }: { label: string; value: TriState; onChange: (v: TriState) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={(v) => onChange(v as TriState)}>
        <SelectTrigger className="h-8 w-[110px] bg-card/60 border-border/60 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="any">Any</SelectItem>
          <SelectItem value="true">Yes</SelectItem>
          <SelectItem value="false">No</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function FilterBar(props: {
  version: GameVersion;
  fImmortality: TriState; setFImmortality: (v: TriState) => void;
  fEpic: TriState; setFEpic: (v: TriState) => void;
  fRiseOfIx: TriState; setFRiseOfIx: (v: TriState) => void;
  fBaseLeaders: TriState; setFBaseLeaders: (v: TriState) => void;
  compare: boolean; onCompareChange: (v: boolean) => void;
}) {
  const { version } = props;
  return (
    <div className="flex flex-wrap items-center gap-4 mb-4 p-3 rounded-md border border-border/60 bg-card/40">
      <TriSelect label="Immortality" value={props.fImmortality} onChange={props.setFImmortality} />
      {version === "ix" && (
        <TriSelect label="Epic Mode" value={props.fEpic} onChange={props.setFEpic} />
      )}
      {version === "uprising" && (
        <>
          <TriSelect label="Rise of Ix" value={props.fRiseOfIx} onChange={props.setFRiseOfIx} />
          <TriSelect label="Base Leaders" value={props.fBaseLeaders} onChange={props.setFBaseLeaders} />
        </>
      )}
      <div className="flex items-center gap-2 ml-auto">
        <UserCheck className="size-4 text-sand" />
        <Label htmlFor="compare-personal" className="text-xs uppercase tracking-wider text-muted-foreground cursor-pointer">
          Compare with my stats
        </Label>
        <Switch id="compare-personal" checked={props.compare} onCheckedChange={props.onCompareChange} />
      </div>
    </div>
  );
}

export const Route = createFileRoute("/stats")({
  head: () => ({ meta: [{ title: "Leader stats · Strategy Arena" }] }),
  component: StatsPage,
});

type Row = {
  placement: number;
  leader_name: string | null;
  player_name: string | null;
  points: number;
  spice: number | null;
  solaris: number | null;
  water: number | null;
  has_high_council: boolean | null;
  has_swordmaster: boolean | null;
  turn_order: number | null;
  player_slot: number | null;
  emperor_level: number | null;
  emperor_alliance: boolean | null;
  spacing_guild_level: number | null;
  spacing_guild_alliance: boolean | null;
  bene_gesserit_level: number | null;
  bene_gesserit_alliance: boolean | null;
  fremen_level: number | null;
  fremen_alliance: boolean | null;
  games: {
    id: string;
    game_version: GameVersion;
    has_rise_of_ix: boolean | null;
    has_epic_mode: boolean | null;
    has_immortality: boolean | null;
    has_base_leaders: boolean | null;
    ai_scan_status: string | null;
    end_round: number | null;
    conflict_title: string | null;
  } | null;
};


type Agg = {
  leader: string;
  group: "base" | "ix" | "uprising" | "other";
  picks: number;
  wins: number;
  top2: number;
  totalPoints: number;
};

const CANON = new Map<string, string>();
for (const g of ["base", "ix", "uprising"] as const) {
  for (const name of LEADERS[g]) {
    CANON.set(normalize(name), name);
  }
}

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalize(raw: string | null): { name: string; group: Agg["group"] } | null {
  if (!raw) return null;
  const n = normalize(raw);
  if (!n) return null;
  if (CANON.has(n)) {
    const name = CANON.get(n)!;
    const g = classifyLeader(name);
    return { name, group: g ?? "other" };
  }
  for (const [key, name] of CANON) {
    if (n.includes(key) || key.includes(n)) {
      const g = classifyLeader(name);
      return { name, group: g ?? "other" };
    }
  }
  const g = classifyLeader(raw);
  return { name: raw, group: g ?? "other" };
}

function toneClass(personal: number | null, global: number, epsilon = 0.0001) {
  if (personal === null) return "text-muted-foreground";
  const diff = personal - global;
  if (Math.abs(diff) < epsilon) return "text-muted-foreground";
  return diff > 0 ? "text-emerald-400" : "text-red-400";
}

function StatsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState<GameVersion>("overall");
  const [mode, setMode] = useState<"basic" | "advanced">("basic");
  const [advView, setAdvView] = useState<"leaders" | "meta">("leaders");
  const [advSortKey, setAdvSortKey] = useState<"games" | "hc" | "sm" | "alliances" | "vpb" | "prod">("games");
  const [advSortDir, setAdvSortDir] = useState<"desc" | "asc">("desc");
  const [userLeaders, setUserLeaders] = useState<Set<string>>(new Set());
  const [playerKeys, setPlayerKeys] = useState<string[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [compare, setCompare] = useState(false);
  const [fEpic, setFEpic] = useState<TriState>("any");
  const [fImmortality, setFImmortality] = useState<TriState>("any");
  const [fBaseLeaders, setFBaseLeaders] = useState<TriState>("any");
  const [fRiseOfIx, setFRiseOfIx] = useState<TriState>("any");
  const [fPlayers, setFPlayers] = useState<"any" | "3" | "4">("any");
  const [fVerified, setFVerified] = useState<"any" | "manual">("any");
  const [fLeader, setFLeader] = useState<string>("any");
  const [fPlayer, setFPlayer] = useState<string>("");

  useEffect(() => {
    if (version !== "ix") setFEpic("any");
    if (version !== "uprising") {
      setFRiseOfIx("any");
      setFBaseLeaders("any");
    }
  }, [version]);
  type SortKey =
    | "picks" | "pickPct" | "wins" | "winPct" | "top2Pct" | "avgPts"
    | "youPicks" | "youPickPct" | "youWins" | "youWinPct" | "youTop2Pct" | "youAvgPts";
  const GROUP_COLOR: Record<Agg["group"], string> = {
    base: "text-[#D4A373]",
    ix: "text-[#4A90E2]",
    uprising: "text-[#A94444]",
    other: "",
  };
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"desc" | "asc" | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? null;
      setUserId(uid);
      if (!uid) return;
      const { data: claims } = await supabase
        .from("player_ratings")
        .select("player_key")
        .eq("claimed_by", uid);
      const keys = Array.from(new Set((claims ?? []).map((c) => c.player_key)));
      setPlayerKeys(keys);
      if (keys.length === 0) return;
      const { data: mine } = await supabase
        .from("game_results")
        .select("leader_name")
        .in("player_name", keys);
      const set = new Set<string>();
      for (const r of mine ?? []) {
        const c = canonicalize(r.leader_name as string | null);
        if (c) set.add(c.name);
      }
      setUserLeaders(set);
    })();
  }, []);

  function handleCompareToggle(next: boolean) {
    if (next && !userId) {
      navigate({ to: "/profile" });
      return;
    }
    setCompare(next);
  }

  useEffect(() => {
    setLoading(true);
    (async () => {
      const PAGE = 1000;
      const out: Row[] = [];
      let from = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from("game_results")
          .select("placement, leader_name, player_name, points, spice, solaris, water, has_high_council, has_swordmaster, turn_order, player_slot, emperor_level, emperor_alliance, spacing_guild_level, spacing_guild_alliance, bene_gesserit_level, bene_gesserit_alliance, fremen_level, fremen_alliance, games!inner(id, game_version, has_rise_of_ix, has_epic_mode, has_immortality, has_base_leaders, ai_scan_status, end_round, conflict_title)")
          .order("id", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error || !data || data.length === 0) break;
        out.push(...(data as unknown as Row[]));
        if (data.length < PAGE) break;
        from += PAGE;
      }
      setRows(out);
      setLoading(false);
    })();
  }, []);

  const showPersonal = compare && !!userId && playerKeys.length > 0;
  const playerKeySet = useMemo(() => new Set(playerKeys.map((k) => k.toLowerCase().trim())), [playerKeys]);

  const { aggregates, personalAgg, totalGames, personalTotalSlots, totalGamesCount } = useMemo(() => {
    let filtered =
      version === "overall"
        ? rows
        : rows.filter((r) => r.games?.game_version === version);
    const matchBool = (state: TriState, val: boolean | null | undefined) => {
      if (state === "any") return true;
      return Boolean(val) === (state === "true");
    };
    filtered = filtered.filter((r) =>
      matchBool(fImmortality, r.games?.has_immortality) &&
      (version === "ix" ? matchBool(fEpic, r.games?.has_epic_mode) : true) &&
      (version === "uprising" ? matchBool(fRiseOfIx, r.games?.has_rise_of_ix) : true) &&
      (version === "uprising" ? matchBool(fBaseLeaders, r.games?.has_base_leaders) : true),
    );
    const totalSlots = filtered.length;
    const gameIds = new Set<string>();
    for (const r of filtered) if (r.games?.id) gameIds.add(r.games.id);
    const totalGamesCount = gameIds.size;
    const map = new Map<string, Agg>();
    const pmap = new Map<string, Agg>();
    let personalSlots = 0;
    for (const r of filtered) {
      const c = canonicalize(r.leader_name);
      if (!c) continue;
      const key = c.name;
      const a = map.get(key) ?? { leader: c.name, group: c.group, picks: 0, wins: 0, top2: 0, totalPoints: 0 };
      a.picks += 1;
      if (r.placement === 1) a.wins += 1;
      if (r.placement <= 2) a.top2 += 1;
      a.totalPoints += r.points;
      map.set(key, a);

      if (showPersonal && r.player_name && playerKeySet.has(r.player_name.toLowerCase().trim())) {
        personalSlots += 1;
        const p = pmap.get(key) ?? { leader: c.name, group: c.group, picks: 0, wins: 0, top2: 0, totalPoints: 0 };
        p.picks += 1;
        if (r.placement === 1) p.wins += 1;
        if (r.placement <= 2) p.top2 += 1;
        p.totalPoints += r.points;
        pmap.set(key, p);
      }
    }
    const aggregates = Array.from(map.values()).sort((a, b) => b.picks - a.picks);
    return { aggregates, personalAgg: pmap, totalGames: totalSlots, personalTotalSlots: personalSlots, totalGamesCount };
  }, [rows, version, fEpic, fImmortality, fBaseLeaders, fRiseOfIx, showPersonal, playerKeySet]);

  type AdvAgg = {
    leader: string;
    group: Agg["group"];
    games: number;
    hcN: number; hcYes: number;
    smN: number; smYes: number;
    allianceSum: number; allianceN: number;
    vpPerBumpSum: number;
    vpPerBumpN: number;
    productiveSum: number;
    productiveN: number;
  };
  type SeatStat = { seat: number; n: number; wins: number; top2: number; points: number; places: number[] };
  type UpgradeStat = { label: string; n: number; wins: number; placementSum: number; places: number[] };
  type PaceStat = { label: string; games: number; winScoreSum: number; winScoreN: number };
  /** Colour a placement share against the fair baseline; 3rd/4th are inverted. */
  const placeTone = (pct: number | null, baseline: number, place: number) => {
    if (pct === null || baseline <= 0) return "text-foreground";
    const diff = place <= 2 ? pct - baseline : baseline - pct;
    if (diff >= 4) return "text-emerald-400";
    if (diff >= 1.5) return "text-emerald-300/80";
    if (diff <= -4) return "text-red-400";
    if (diff <= -1.5) return "text-amber-400";
    return "text-foreground";
  };
  const PLACE_BAR = ["bg-emerald-400", "bg-teal-400", "bg-amber-400", "bg-red-400"];
  const { advancedAgg, personalAdvAgg, scannedGamesCount, meta, personalMeta } = useMemo(() => {
    const matchBool = (state: TriState, val: boolean | null | undefined) => {
      if (state === "any") return true;
      return Boolean(val) === (state === "true");
    };
    const scanned = rows.filter((r) => {
      const st = r.games?.ai_scan_status;
      if (!st || !st.trim()) return false;
      if (st.trim().toLowerCase() === "no") return false;
      if (fVerified === "manual" && st.trim().toLowerCase() !== "manually verified") return false;
      if (version !== "overall" && r.games?.game_version !== version) return false;
      return (
        matchBool(fImmortality, r.games?.has_immortality) &&
        (version === "ix" ? matchBool(fEpic, r.games?.has_epic_mode) : true) &&
        (version === "uprising" ? matchBool(fRiseOfIx, r.games?.has_rise_of_ix) : true) &&
        (version === "uprising" ? matchBool(fBaseLeaders, r.games?.has_base_leaders) : true)
      );
    });
    const byGame = new Map<string, Row[]>();
    for (const r of scanned) {
      const gid = r.games?.id;
      if (!gid) continue;
      const arr = byGame.get(gid) ?? [];
      arr.push(r);
      byGame.set(gid, arr);
    }
    let countedGames = 0;
    const map = new Map<string, AdvAgg>();
    const pmap = new Map<string, AdvAgg>();
    const seats: SeatStat[] = [1, 2, 3, 4].map((seat) => ({ seat, n: 0, wins: 0, top2: 0, points: 0, places: [0, 0, 0, 0] }));
    const upgrades: UpgradeStat[] = [
      { label: "Both HC + SM", n: 0, wins: 0, placementSum: 0, places: [0, 0, 0, 0] },
      { label: "Swordmaster only", n: 0, wins: 0, placementSum: 0, places: [0, 0, 0, 0] },
      { label: "High Council only", n: 0, wins: 0, placementSum: 0, places: [0, 0, 0, 0] },
      { label: "Neither", n: 0, wins: 0, placementSum: 0, places: [0, 0, 0, 0] },
    ];
    const pace: PaceStat[] = [
      { label: "Round 6 or earlier", games: 0, winScoreSum: 0, winScoreN: 0 },
      { label: "Round 7", games: 0, winScoreSum: 0, winScoreN: 0 },
      { label: "Round 8", games: 0, winScoreSum: 0, winScoreN: 0 },
      { label: "Round 9+", games: 0, winScoreSum: 0, winScoreN: 0 },
    ];
    let paceKnown = 0;
    const conflictMap = new Map<string, { label: string; total: number; early: number; r7: number; r8: number; r9: number; versions: Set<string> }>();
    let conflictTotal = 0;
    const allianceGames: Record<FactionKey, number> = { emperor: 0, spacing_guild: 0, bene_gesserit: 0, fremen: 0 };
    const factionLevelSum: Record<FactionKey, number> = { emperor: 0, spacing_guild: 0, bene_gesserit: 0, fremen: 0 };
    const factionLevelN: Record<FactionKey, number> = { emperor: 0, spacing_guild: 0, bene_gesserit: 0, fremen: 0 };
    let allianceGameN = 0;
    let totalBumpsAll = 0;
    let productiveBumpsAll = 0;
    const mkAllianceBuckets = (): UpgradeStat[] => [
      ...FACTION_KEYS.map((f) => ({ label: FACTION_LABEL[f], n: 0, wins: 0, placementSum: 0, places: [0, 0, 0, 0] })),
      { label: "No alliance", n: 0, wins: 0, placementSum: 0, places: [0, 0, 0, 0] },
    ];
    const allianceEffect = mkAllianceBuckets();
    let allianceSeatN = 0;
    const allianceSeatPlaces = [0, 0, 0, 0];
    const pAllianceEffect = mkAllianceBuckets();
    let pAllianceSeatN = 0;
    // Personal (compare-with-me) mirrors of the meta cards
    const pSeats: SeatStat[] = [1, 2, 3, 4].map((seat) => ({ seat, n: 0, wins: 0, top2: 0, points: 0, places: [0, 0, 0, 0] }));
    const pUpgrades: UpgradeStat[] = [
      { label: "Both HC + SM", n: 0, wins: 0, placementSum: 0, places: [0, 0, 0, 0] },
      { label: "Swordmaster only", n: 0, wins: 0, placementSum: 0, places: [0, 0, 0, 0] },
      { label: "High Council only", n: 0, wins: 0, placementSum: 0, places: [0, 0, 0, 0] },
      { label: "Neither", n: 0, wins: 0, placementSum: 0, places: [0, 0, 0, 0] },
    ];
    let pUpgradeTotal = 0;
    const pPace: PaceStat[] = [
      { label: "Round 6 or earlier", games: 0, winScoreSum: 0, winScoreN: 0 },
      { label: "Round 7", games: 0, winScoreSum: 0, winScoreN: 0 },
      { label: "Round 8", games: 0, winScoreSum: 0, winScoreN: 0 },
      { label: "Round 9+", games: 0, winScoreSum: 0, winScoreN: 0 },
    ];
    let pPaceKnown = 0;
    const pAllianceGames: Record<FactionKey, number> = { emperor: 0, spacing_guild: 0, bene_gesserit: 0, fremen: 0 };
    const pFactionLevelSum: Record<FactionKey, number> = { emperor: 0, spacing_guild: 0, bene_gesserit: 0, fremen: 0 };
    const pFactionLevelN: Record<FactionKey, number> = { emperor: 0, spacing_guild: 0, bene_gesserit: 0, fremen: 0 };
    let pAllianceGameN = 0;
    let pTotalBumps = 0;
    let pProductiveBumps = 0;

    const playerQ = fPlayer.trim().toLowerCase();
    for (const gameRows of byGame.values()) {
      if (fPlayers !== "any" && gameRows.length !== Number(fPlayers)) continue;
      if (fLeader !== "any" && !gameRows.some((r) => canonicalize(r.leader_name)?.name === fLeader)) continue;
      if (playerQ && !gameRows.some((r) => (r.player_name ?? "").toLowerCase().includes(playerQ))) continue;
      countedGames += 1;
      const players = gameRows.map((r) => ({
        placement: r.placement,
        player_name: r.player_name ?? "",
        leader_name: r.leader_name,
        points: r.points,
        spice: r.spice,
        solaris: r.solaris,
        water: r.water,
        is_leaver: null,
        player_slot: r.player_slot,
        turn_order: r.turn_order,
        player_color: null,
        has_first_player: null,
        has_high_council: r.has_high_council,
        has_swordmaster: r.has_swordmaster,
        emperor_level: r.emperor_level,
        emperor_alliance: r.emperor_alliance,
        spacing_guild_level: r.spacing_guild_level,
        spacing_guild_alliance: r.spacing_guild_alliance,
        bene_gesserit_level: r.bene_gesserit_level,
        bene_gesserit_alliance: r.bene_gesserit_alliance,
        fremen_level: r.fremen_level,
        fremen_alliance: r.fremen_alliance,
      }));

      // Card 3: pacing
      const endRound = gameRows[0]?.games?.end_round ?? null;
      const paceIndex = (n: number) => (n <= 6 ? 0 : n === 7 ? 1 : n === 8 ? 2 : 3);

      // Final conflicts
      const rawConflict = gameRows[0]?.games?.conflict_title;
      if (rawConflict && rawConflict.trim()) {
        const label = titleCaseConflict(rawConflict);
        const c = conflictMap.get(label) ?? { label, total: 0, early: 0, r7: 0, r8: 0, r9: 0, versions: new Set<string>() };
        c.total += 1;
        if (endRound !== null) {
          if (endRound <= 6) c.early += 1;
          else if (endRound === 7) c.r7 += 1;
          else if (endRound === 8) c.r8 += 1;
          else c.r9 += 1;
        }
        const gv = gameRows[0]?.games?.game_version;
        if (gv) c.versions.add(gv);
        conflictMap.set(label, c);
        conflictTotal += 1;
      }

      if (endRound && endRound >= 1) {
        const bucket = pace[paceIndex(endRound)];
        bucket.games += 1;
        paceKnown += 1;
        const winner = gameRows.find((r) => r.placement === 1);
        if (winner) { bucket.winScoreSum += winner.points; bucket.winScoreN += 1; }
      }

      // Card 4: alliance claim rates
      allianceGameN += 1;
      for (const f of FACTION_KEYS) {
        if (players.some((p) => p[FACTION_ALLIANCE_KEYS[f]] === true)) allianceGames[f] += 1;
      }

      // Personal pacing + alliances: only games the user actually played in
      const meIdx = showPersonal
        ? gameRows.findIndex((r) => r.player_name && playerKeySet.has(r.player_name.toLowerCase().trim()))
        : -1;
      if (meIdx >= 0) {
        const me = gameRows[meIdx];
        if (endRound && endRound >= 1) {
          const bucket = pPace[paceIndex(endRound)];
          bucket.games += 1;
          pPaceKnown += 1;
          if (me.placement === 1) { bucket.winScoreSum += me.points; bucket.winScoreN += 1; }
        }
        pAllianceGameN += 1;
        for (const f of FACTION_KEYS) {
          if (players[meIdx][FACTION_ALLIANCE_KEYS[f]] === true) pAllianceGames[f] += 1;
        }
      }

      for (let i = 0; i < gameRows.length; i++) {
        const r = gameRows[i];
        const eff = influenceEfficiency(players[i], players);
        totalBumpsAll += eff.totalBumps;
        if (eff.productivePct !== null) {
          productiveBumpsAll += (eff.productivePct / 100) * eff.totalBumps;
        }

        // Card 1: seat / turn order
        const seat = r.turn_order;
        if (seat && seat >= 1 && seat <= 4) {
          const s = seats[seat - 1];
          s.n += 1;
          if (r.placement === 1) s.wins += 1;
          if (r.placement <= 2) s.top2 += 1;
          s.points += r.points;
          if (r.placement >= 1 && r.placement <= 4) s.places[r.placement - 1] += 1;
        }

        // Card 2: upgrade combinations
        if (r.has_high_council !== null || r.has_swordmaster !== null) {
          const hc = r.has_high_council === true;
          const sm = r.has_swordmaster === true;
          const u = hc && sm ? upgrades[0] : sm ? upgrades[1] : hc ? upgrades[2] : upgrades[3];
          u.n += 1;
          if (r.placement === 1) u.wins += 1;
          u.placementSum += r.placement;
          if (r.placement >= 1 && r.placement <= 4) u.places[r.placement - 1] += 1;
        }

        // Card 5: alliances vs placement
        {
          allianceSeatN += 1;
          if (r.placement >= 1 && r.placement <= 4) allianceSeatPlaces[r.placement - 1] += 1;
          let held = 0;
          FACTION_KEYS.forEach((f, fi) => {
            if (players[i][FACTION_ALLIANCE_KEYS[f]] === true) {
              held += 1;
              const b = allianceEffect[fi];
              b.n += 1;
              if (r.placement === 1) b.wins += 1;
              b.placementSum += r.placement;
              if (r.placement >= 1 && r.placement <= 4) b.places[r.placement - 1] += 1;
            }
          });
          if (held === 0) {
            const b = allianceEffect[4];
            b.n += 1;
            if (r.placement === 1) b.wins += 1;
            b.placementSum += r.placement;
            if (r.placement >= 1 && r.placement <= 4) b.places[r.placement - 1] += 1;
          }
          if (i === meIdx) {
            pAllianceSeatN += 1;
            FACTION_KEYS.forEach((f, fi) => {
              if (players[i][FACTION_ALLIANCE_KEYS[f]] === true) {
                const b = pAllianceEffect[fi];
                b.n += 1;
                if (r.placement === 1) b.wins += 1;
                b.placementSum += r.placement;
                if (r.placement >= 1 && r.placement <= 4) b.places[r.placement - 1] += 1;
              }
            });
            if (held === 0) {
              const b = pAllianceEffect[4];
              b.n += 1;
              if (r.placement === 1) b.wins += 1;
              b.placementSum += r.placement;
              if (r.placement >= 1 && r.placement <= 4) b.places[r.placement - 1] += 1;
            }
          }
        }

        // Card 4: average level reached per faction track
        for (const f of FACTION_KEYS) {
          const lv = r[FACTION_LEVEL_KEYS[f]];
          if (lv !== null && lv !== undefined) {
            factionLevelSum[f] += Number(lv);
            factionLevelN[f] += 1;
          }
        }

        // Personal mirrors of cards 1, 2 and the stranded-bump metric
        if (i === meIdx) {
          pTotalBumps += eff.totalBumps;
          if (eff.productivePct !== null) {
            pProductiveBumps += (eff.productivePct / 100) * eff.totalBumps;
          }
          if (seat && seat >= 1 && seat <= 4) {
            const s = pSeats[seat - 1];
            s.n += 1;
            if (r.placement === 1) s.wins += 1;
            if (r.placement <= 2) s.top2 += 1;
            s.points += r.points;
            if (r.placement >= 1 && r.placement <= 4) s.places[r.placement - 1] += 1;
          }
          if (r.has_high_council !== null || r.has_swordmaster !== null) {
            const hc = r.has_high_council === true;
            const sm = r.has_swordmaster === true;
            const u = hc && sm ? pUpgrades[0] : sm ? pUpgrades[1] : hc ? pUpgrades[2] : pUpgrades[3];
            u.n += 1;
            if (r.placement === 1) u.wins += 1;
            u.placementSum += r.placement;
            if (r.placement >= 1 && r.placement <= 4) u.places[r.placement - 1] += 1;
            pUpgradeTotal += 1;
          }
          for (const f of FACTION_KEYS) {
            const lv = r[FACTION_LEVEL_KEYS[f]];
            if (lv !== null && lv !== undefined) {
              pFactionLevelSum[f] += Number(lv);
              pFactionLevelN[f] += 1;
            }
          }
        }

        const c = canonicalize(r.leader_name);
        if (!c) continue;
        const a = map.get(c.name) ?? {
          leader: c.name, group: c.group, games: 0,
          hcN: 0, hcYes: 0, smN: 0, smYes: 0, allianceSum: 0, allianceN: 0,
          vpPerBumpSum: 0, vpPerBumpN: 0, productiveSum: 0, productiveN: 0,
        };
        a.games += 1;
        if (r.has_high_council !== null) { a.hcN += 1; if (r.has_high_council) a.hcYes += 1; }
        if (r.has_swordmaster !== null) { a.smN += 1; if (r.has_swordmaster) a.smYes += 1; }
        a.allianceN += 1;
        a.allianceSum += FACTION_KEYS.filter((f) => players[i][FACTION_ALLIANCE_KEYS[f]] === true).length;
        if (eff.vpPerBump !== null) { a.vpPerBumpSum += eff.vpPerBump; a.vpPerBumpN += 1; }
        if (eff.productivePct !== null) { a.productiveSum += eff.productivePct; a.productiveN += 1; }
        map.set(c.name, a);

        if (showPersonal && r.player_name && playerKeySet.has(r.player_name.toLowerCase().trim())) {
          const p = pmap.get(c.name) ?? {
            leader: c.name, group: c.group, games: 0,
            hcN: 0, hcYes: 0, smN: 0, smYes: 0, allianceSum: 0, allianceN: 0,
            vpPerBumpSum: 0, vpPerBumpN: 0, productiveSum: 0, productiveN: 0,
          };
          p.games += 1;
          if (r.has_high_council !== null) { p.hcN += 1; if (r.has_high_council) p.hcYes += 1; }
          if (r.has_swordmaster !== null) { p.smN += 1; if (r.has_swordmaster) p.smYes += 1; }
          p.allianceN += 1;
          p.allianceSum += FACTION_KEYS.filter((f) => players[i][FACTION_ALLIANCE_KEYS[f]] === true).length;
          if (eff.vpPerBump !== null) { p.vpPerBumpSum += eff.vpPerBump; p.vpPerBumpN += 1; }
          if (eff.productivePct !== null) { p.productiveSum += eff.productivePct; p.productiveN += 1; }
          pmap.set(c.name, p);
        }
      }
    }
    const advancedAgg = Array.from(map.values()).sort((a, b) => b.games - a.games);
    const upgradeTotal = upgrades.reduce((s, u) => s + u.n, 0);
    return {
      advancedAgg,
      personalAdvAgg: pmap,
      scannedGamesCount: countedGames,
      meta: {
        seats,
        upgrades,
        upgradeTotal,
        pace,
        paceKnown,
        allianceGames,
        allianceGameN,
        factionLevelSum,
        factionLevelN,
        totalBumpsAll,
        allianceEffect,
        allianceSeatN,
        allianceSeatPlaces,
        strandedPct: totalBumpsAll > 0 ? ((totalBumpsAll - productiveBumpsAll) / totalBumpsAll) * 100 : null,
        conflictTotal,
        conflicts: Array.from(conflictMap.values())
          .map((c) => ({ label: c.label, total: c.total, early: c.early, r7: c.r7, r8: c.r8, r9: c.r9, versions: Array.from(c.versions).sort() }))
          .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label)),
      },
      personalMeta: {
        seats: pSeats,
        upgrades: pUpgrades,
        upgradeTotal: pUpgradeTotal,
        pace: pPace,
        paceKnown: pPaceKnown,
        allianceGames: pAllianceGames,
        allianceGameN: pAllianceGameN,
        allianceEffect: pAllianceEffect,
        allianceSeatN: pAllianceSeatN,
        factionLevelSum: pFactionLevelSum,
        factionLevelN: pFactionLevelN,
        strandedPct: pTotalBumps > 0 ? ((pTotalBumps - pProductiveBumps) / pTotalBumps) * 100 : null,
      },
    };
  }, [rows, version, fEpic, fImmortality, fBaseLeaders, fRiseOfIx, fPlayers, fVerified, fLeader, fPlayer, showPersonal, playerKeySet]);

  const ALL_LEADER_NAMES = useMemo(() => Array.from(new Set(Array.from(CANON.values()))).sort(), []);
  const allPlayerNames = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      const n = r.player_name?.trim();
      if (n) s.add(n);
    }
    return Array.from(s).sort();
  }, [rows]);


  const advancedSorted = useMemo(() => {
    const dir = advSortDir === "desc" ? -1 : 1;
    const score = (a: typeof advancedAgg[number]) => {
      switch (advSortKey) {
        case "games": return a.games;
        case "hc": return a.hcN ? a.hcYes / a.hcN : -1;
        case "sm": return a.smN ? a.smYes / a.smN : -1;
        case "alliances": return a.allianceN ? a.allianceSum / a.allianceN : -1;
        case "vpb": return a.vpPerBumpN ? a.vpPerBumpSum / a.vpPerBumpN : -1;
        case "prod": return a.productiveN ? a.productiveSum / a.productiveN : -1;
      }
    };
    return [...advancedAgg].sort((a, b) => {
      const av = score(a), bv = score(b);
      if (av === bv) return a.leader.localeCompare(b.leader);
      return av < bv ? dir : -dir;
    });
  }, [advancedAgg, advSortKey, advSortDir]);

  function AdvTh({ label, k, info }: { label: string; k: typeof advSortKey; info?: string }) {
    const active = advSortKey === k;
    const Icon = active ? (advSortDir === "desc" ? ArrowDown : ArrowUp) : ArrowUpDown;
    return (
      <th className="px-4 py-3 text-right">
        <span className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              if (advSortKey !== k) { setAdvSortKey(k); setAdvSortDir("desc"); }
              else setAdvSortDir(advSortDir === "desc" ? "asc" : "desc");
            }}
            className={`inline-flex items-center gap-1 hover:text-sand transition-colors ${active ? "text-sand" : ""}`}
          >
            {label}<Icon className={`size-3 ${active ? "opacity-100" : "opacity-40"}`} />
          </button>
          {info && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help text-muted-foreground hover:text-sand"><HelpCircle className="size-3.5" /></span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs normal-case tracking-normal">{info}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </span>
      </th>
    );
  }

  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return aggregates;
    const dir = sortDir === "desc" ? -1 : 1;
    const score = (a: Agg): number => {
      const p = personalAgg.get(a.leader);
      switch (sortKey) {
        case "picks": return a.picks;
        case "pickPct": return totalGames ? a.picks / totalGames : 0;
        case "wins": return a.wins;
        case "winPct": return a.picks ? a.wins / a.picks : 0;
        case "top2Pct": return a.picks ? a.top2 / a.picks : 0;
        case "avgPts": return a.picks ? a.totalPoints / a.picks : 0;
        case "youPicks": return p?.picks ?? -1;
        case "youPickPct": return p && personalTotalSlots ? p.picks / personalTotalSlots : -1;
        case "youWins": return p?.wins ?? -1;
        case "youWinPct": return p && p.picks ? p.wins / p.picks : -1;
        case "youTop2Pct": return p && p.picks ? p.top2 / p.picks : -1;
        case "youAvgPts": return p && p.picks ? p.totalPoints / p.picks : -1;
      }
    };
    return [...aggregates].sort((a, b) => {
      const av = score(a), bv = score(b);
      if (av === bv) return a.leader.localeCompare(b.leader);
      return av < bv ? dir : -dir;
    });
  }, [aggregates, sortKey, sortDir, totalGames, personalAgg, personalTotalSlots]);

  function cycleSort(k: SortKey) {
    if (sortKey !== k) { setSortKey(k); setSortDir("desc"); }
    else if (sortDir === "desc") setSortDir("asc");
    else { setSortKey(null); setSortDir(null); }
  }
  function SortTh({ label, k, className = "" }: { label: string; k: SortKey; className?: string }) {
    const active = sortKey === k;
    const Icon = active ? (sortDir === "desc" ? ArrowDown : ArrowUp) : ArrowUpDown;
    return (
      <th className={`px-4 py-3 text-right ${className}`}>
        <button type="button" onClick={() => cycleSort(k)}
          className={`inline-flex items-center gap-1 ml-auto hover:text-sand transition-colors ${active ? "text-sand" : ""}`}>
          {label}<Icon className={`size-3 ${active ? "opacity-100" : "opacity-40"}`} />
        </button>
      </th>
    );
  }

  const personalCell = (personal: number | null, global: number, suffix = "", digits = 1, invert = false) => {
    if (personal === null) {
      return <span className="text-muted-foreground/60">—</span>;
    }
    const shown = invert ? 2 * global - personal : personal;
    return <span className={toneClass(shown, global)}>{personal.toFixed(digits)}{suffix}</span>;
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto px-4 py-10">
        <div className="flex items-center gap-3 mb-2">
          <BarChart3 className="size-7 text-sand" />
          <h1 className="font-display text-3xl">Leader stats</h1>
        </div>
        <p className="text-muted-foreground mb-6">
          Pick rate (share of seats this leader filled) and win rate per leader, by leaderboard version.
        </p>

        <Tabs value={mode} onValueChange={(v) => setMode(v as "basic" | "advanced")}>
          <TabsList className="grid grid-cols-2 gap-3 bg-transparent border-0 h-auto p-0 mb-6">
            <TabsTrigger
              value="basic"
              className="data-[state=active]:border-sand data-[state=active]:bg-sand/10 data-[state=active]:text-foreground border border-border/60 bg-card/60 rounded-lg p-4 h-auto flex-col items-start gap-1 text-left"
            >
              <span className="flex items-center gap-2 font-display text-base">
                <BarChart3 className="size-4 text-sand" />
                Basic stats
              </span>
              <span className="text-xs font-sans font-normal text-muted-foreground normal-case tracking-normal">
                Pick rate, win rate, and points per leader across all recorded games.
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="advanced"
              className="data-[state=active]:border-sand data-[state=active]:bg-sand/10 data-[state=active]:text-foreground border border-border/60 bg-card/60 rounded-lg p-4 h-auto flex-col items-start gap-1 text-left"
            >
              <span className="flex items-center gap-2 font-display text-base">
                <FlaskConical className="size-4 text-sand" />
                Advanced stats
              </span>
              <span className="text-xs font-sans font-normal text-muted-foreground normal-case tracking-normal">
                Influence efficiency (VP/Bump & Bump Productive %) for games with endboard scan data only.
              </span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Tabs value={version} onValueChange={(v) => setVersion(v as GameVersion)}>
          <TabsList className="bg-card/60 border border-border/60 mb-4">
            {GAME_VERSIONS.map((v) => (
              <TabsTrigger
                key={v.value}
                value={v.value}
                className="data-[state=active]:bg-sand data-[state=active]:text-sand-foreground"
              >
                {v.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {GAME_VERSIONS.map((v) => (
            <TabsContent key={v.value} value={v.value}>
              <FilterBar
                version={version}
                fImmortality={fImmortality} setFImmortality={setFImmortality}
                fEpic={fEpic} setFEpic={setFEpic}
                fRiseOfIx={fRiseOfIx} setFRiseOfIx={setFRiseOfIx}
                fBaseLeaders={fBaseLeaders} setFBaseLeaders={setFBaseLeaders}
                compare={compare} onCompareChange={handleCompareToggle}
              />
              {compare && userId && playerKeys.length === 0 && (
                <div className="mb-4 p-3 rounded-md border border-sand/40 bg-sand/10 text-sm text-muted-foreground">
                  You haven't claimed a player name yet. Visit your <a href="/profile" className="text-sand underline">profile</a> to link one.
                </div>
              )}
              {mode === "advanced" ? (
                <>
                  <div className="mb-4 p-4 rounded-lg border border-sand/30 bg-sand/5">
                    <div className="flex items-center gap-2 text-sand font-display text-lg">
                      <FlaskConical className="size-5" />
                      Advanced influence efficiency
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Showing data from <span className="text-foreground font-semibold">{scannedGamesCount}</span> {scannedGamesCount === 1 ? "game" : "games"} with endboard scan data in {v.label}.
                      {" "}Games without an endboard screenshot are excluded.
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <span className="text-xs uppercase tracking-wider text-muted-foreground">Players per game</span>
                      <Select value={fPlayers} onValueChange={(v) => setFPlayers(v as "any" | "3" | "4")}>
                        <SelectTrigger className="h-8 w-[130px] bg-card/60 border-border/60 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">All</SelectItem>
                          <SelectItem value="3">3 players</SelectItem>
                          <SelectItem value="4">4 players</SelectItem>
                        </SelectContent>
                      </Select>
                      <span className="text-xs uppercase tracking-wider text-muted-foreground ml-2">Verification</span>
                      <Select value={fVerified} onValueChange={(v) => setFVerified(v as "any" | "manual")}>
                        <SelectTrigger className="h-8 w-[170px] bg-card/60 border-border/60 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">Any scan status</SelectItem>
                          <SelectItem value="manual">Manually verified only</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-5">
                    {([
                      { key: "leaders", icon: Crown, title: "Advanced Leader Stats", desc: "Upgrades, alliances and influence efficiency per leader." },
                      { key: "meta", icon: Landmark, title: "General Meta Stats", desc: "Seat balance, upgrade paths, pacing and faction dynamics." },
                    ] as const).map((t) => {
                      const Icon = t.icon;
                      const active = advView === t.key;
                      return (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() => setAdvView(t.key)}
                          className={`border rounded-lg p-4 text-left transition-colors ${active ? "border-sand bg-sand/10" : "border-border/60 bg-card/60 hover:bg-card"}`}
                        >
                          <span className="flex items-center gap-2 font-display text-base">
                            <Icon className="size-4 text-sand" />
                            {t.title}
                          </span>
                          <span className="block text-xs text-muted-foreground mt-1">{t.desc}</span>
                        </button>
                      );
                    })}
                  </div>

                  {!loading && scannedGamesCount === 0 ? (
                    <Card className="p-10 text-center text-muted-foreground border-border/60 bg-card/70">
                      No scanned endboard games match these filters for {v.label} yet.
                    </Card>
                  ) : advView === "leaders" ? (
                    <Card className="p-0 overflow-hidden border-border/60 bg-card/70 shadow-arena">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
                              <th className="px-4 py-3 text-left">Leader</th>
                              <AdvTh label="Games" k="games" />
                              {showPersonal && <th className="px-4 py-3 text-right">You</th>}
                              <AdvTh label="HC %" k="hc" />
                              {showPersonal && <th className="px-4 py-3 text-right">You</th>}
                              <AdvTh label="SM %" k="sm" />
                              {showPersonal && <th className="px-4 py-3 text-right">You</th>}
                              <AdvTh label="Avg Alliances" k="alliances" />
                              {showPersonal && <th className="px-4 py-3 text-right">You</th>}
                              <AdvTh label="Avg VP/Bump" k="vpb" info="Direct victory points gained per influence bump. Benchmark is 0.500." />
                              {showPersonal && <th className="px-4 py-3 text-right">You</th>}
                              <AdvTh label="Avg Bump Productive %" k="prod" info="Share of bumps that yielded VPs or defended an alliance against the closest rival. Bumps left stranded on levels 1, 3, or on lost alliance tracks are penalised." />
                              {showPersonal && <th className="px-4 py-3 text-right">You</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {loading && (
                              <tr>
                                <td colSpan={showPersonal ? 13 : 7} className="py-10 text-center text-muted-foreground">Loading stats…</td>
                              </tr>
                            )}
                            {!loading &&
                              advancedSorted.map((a) => {
                                const pa = personalAdvAgg.get(a.leader);
                                const gHc = a.hcN ? (a.hcYes / a.hcN) * 100 : null;
                                const pHc = pa && pa.hcN ? (pa.hcYes / pa.hcN) * 100 : null;
                                const gSm = a.smN ? (a.smYes / a.smN) * 100 : null;
                                const pSm = pa && pa.smN ? (pa.smYes / pa.smN) * 100 : null;
                                const gAl = a.allianceN ? a.allianceSum / a.allianceN : null;
                                const pAl = pa && pa.allianceN ? pa.allianceSum / pa.allianceN : null;
                                const gVpb = a.vpPerBumpN ? a.vpPerBumpSum / a.vpPerBumpN : null;
                                const pVpb = pa && pa.vpPerBumpN ? pa.vpPerBumpSum / pa.vpPerBumpN : null;
                                const gProd = a.productiveN ? a.productiveSum / a.productiveN : null;
                                const pProd = pa && pa.productiveN ? pa.productiveSum / pa.productiveN : null;
                                return (
                                <tr key={a.leader} className="border-t border-border/40 hover:bg-secondary/30">
                                  <td className={`px-4 py-3 font-medium ${GROUP_COLOR[a.group]}`}>
                                    {(() => {
                                      const r = leaderRouteFor(a.leader);
                                      return r ? (
                                        <Link to="/leaders/$origin/$slug" params={{ origin: r.origin, slug: r.slug }} className="hover:underline">
                                          {a.leader}
                                        </Link>
                                      ) : a.leader;
                                    })()}
                                  </td>
                                  <td className="px-4 py-3 text-right tabular-nums">{a.games}</td>
                                  {showPersonal && <td className="px-4 py-3 text-right tabular-nums">{pa ? pa.games : <span className="text-muted-foreground/60">—</span>}</td>}
                                  <td className="px-4 py-3 text-right tabular-nums">
                                    {gHc !== null ? `${gHc.toFixed(1)}%` : "—"}
                                  </td>
                                  {showPersonal && <td className="px-4 py-3 text-right tabular-nums">{personalCell(pHc, gHc ?? 0, "%")}</td>}
                                  <td className="px-4 py-3 text-right tabular-nums">
                                    {gSm !== null ? `${gSm.toFixed(1)}%` : "—"}
                                  </td>
                                  {showPersonal && <td className="px-4 py-3 text-right tabular-nums">{personalCell(pSm, gSm ?? 0, "%")}</td>}
                                  <td className="px-4 py-3 text-right tabular-nums">
                                    {gAl !== null ? gAl.toFixed(2) : "—"}
                                  </td>
                                  {showPersonal && <td className="px-4 py-3 text-right tabular-nums">{personalCell(pAl, gAl ?? 0, "", 2)}</td>}
                                  <td className="px-4 py-3 text-right tabular-nums">
                                    {gVpb !== null ? gVpb.toFixed(3) : "—"}
                                  </td>
                                  {showPersonal && <td className="px-4 py-3 text-right tabular-nums">{personalCell(pVpb, gVpb ?? 0, "", 3)}</td>}
                                  <td className="px-4 py-3 text-right tabular-nums">
                                    {gProd !== null ? `${gProd.toFixed(1)}%` : "—"}
                                  </td>
                                  {showPersonal && <td className="px-4 py-3 text-right tabular-nums">{personalCell(pProd, gProd ?? 0, "%")}</td>}
                                </tr>
                                );
                              })}
                            {!loading && advancedSorted.length === 0 && (
                              <tr>
                                <td colSpan={showPersonal ? 13 : 7} className="py-10 text-center text-muted-foreground">
                                  No scanned endboard games for {v.label} yet.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  ) : loading ? (
                    <Card className="p-10 text-center text-muted-foreground border-border/60 bg-card/70">Loading stats…</Card>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      <Card className="p-5 border-border/60 bg-card/70 shadow-arena">
                        <div className="flex items-center gap-2 font-display text-lg text-sand mb-3">
                          <Users className="size-4" /> Starting position balance
                        </div>
                        {(() => {
                          const totalSeatN = meta.seats.reduce((a, s) => a + s.n, 0);
                          const baselines = [0, 1, 2, 3].map((p) =>
                            totalSeatN ? (meta.seats.reduce((a, s) => a + s.places[p], 0) / totalSeatN) * 100 : 0,
                          );
                          const labels = ["1st", "2nd", "3rd", "4th"];
                          return (
                            <div className="grid gap-3 sm:grid-cols-2">
                              {meta.seats.map((s, si) => {
                                const ps = personalMeta.seats[si];
                                const pct = (v: number) => (s.n ? (v / s.n) * 100 : 0);
                                const gTop2 = pct(s.top2);
                                const gPts = s.n ? s.points / s.n : 0;
                                return (
                                  <div key={s.seat} className="rounded-lg border border-border/60 bg-background/30 p-3">
                                    <div className="flex items-baseline justify-between mb-2">
                                      <div className="font-display text-sm">Seat {s.seat}</div>
                                      <div className="text-xs text-muted-foreground tabular-nums">
                                        {s.n} seats{showPersonal && ps.n ? ` · you ${ps.n}` : ""}
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-4 gap-1 text-center">
                                      {labels.map((lb, p) => {
                                        const val = s.n ? pct(s.places[p]) : null;
                                        const pv = ps.n ? (ps.places[p] / ps.n) * 100 : null;
                                        return (
                                          <div key={lb} className="rounded-md bg-card/60 py-1.5">
                                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{lb}</div>
                                            <div className={`text-base font-display tabular-nums ${placeTone(val, baselines[p], p + 1)}`}>
                                              {val === null ? "—" : `${val.toFixed(1)}%`}
                                            </div>
                                            {showPersonal && (
                                              <div className={`text-[10px] tabular-nums ${placeTone(pv, baselines[p], p + 1)}`}>
                                                {pv === null ? "—" : `you ${pv.toFixed(0)}%`}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                    {s.n > 0 && (
                                      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-muted/40">
                                        {[0, 1, 2, 3].map((p) => (
                                          <div
                                            key={p}
                                            className={PLACE_BAR[p]}
                                            style={{ width: `${pct(s.places[p])}%` }}
                                          />
                                        ))}
                                      </div>
                                    )}
                                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground tabular-nums">
                                      <span>
                                        Top 2 <span className={placeTone(s.n ? gTop2 : null, baselines[0] + baselines[1], 1)}>{s.n ? `${gTop2.toFixed(1)}%` : "—"}</span>
                                        {showPersonal && ps.n ? <span className="ml-1">(you {((ps.top2 / ps.n) * 100).toFixed(0)}%)</span> : null}
                                      </span>
                                      <span>
                                        Avg pts <span className="text-foreground">{s.n ? gPts.toFixed(1) : "—"}</span>
                                        {showPersonal && ps.n ? <span className="ml-1">(you {(ps.points / ps.n).toFixed(1)})</span> : null}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </Card>

                      <Card className="p-5 border-border/60 bg-card/70 shadow-arena">
                        <div className="flex items-center gap-2 font-display text-lg text-sand mb-3">
                          <Crown className="size-4" /> Upgrades vs placement
                        </div>
                        {(() => {
                          const totalUp = meta.upgradeTotal;
                          const baselines = [0, 1, 2, 3].map((p) =>
                            totalUp ? (meta.upgrades.reduce((a, u) => a + u.places[p], 0) / totalUp) * 100 : 0,
                          );
                          const labels = ["1st", "2nd", "3rd", "4th"];
                          return (
                            <div className="grid gap-3 sm:grid-cols-2">
                              {meta.upgrades.map((u, ui) => {
                                const pu = personalMeta.upgrades[ui];
                                const pct = (v: number) => (u.n ? (v / u.n) * 100 : 0);
                                const gShare = totalUp ? (u.n / totalUp) * 100 : 0;
                                const gWin = u.n ? (u.wins / u.n) * 100 : 0;
                                const gPlace = u.n ? u.placementSum / u.n : 0;
                                return (
                                  <div key={u.label} className="rounded-lg border border-border/60 bg-background/30 p-3">
                                    <div className="flex items-baseline justify-between mb-2">
                                      <div className="font-display text-sm">{u.label}</div>
                                      <div className="text-xs text-muted-foreground tabular-nums">
                                        {u.n} seats{showPersonal && pu.n ? ` · you ${pu.n}` : ""}
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-4 gap-1 text-center">
                                      {labels.map((lb, p) => {
                                        const val = u.n ? pct(u.places[p]) : null;
                                        const pv = pu.n ? (pu.places[p] / pu.n) * 100 : null;
                                        return (
                                          <div key={lb} className="rounded-md bg-card/60 py-1.5">
                                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{lb}</div>
                                            <div className={`text-base font-display tabular-nums ${placeTone(val, baselines[p], p + 1)}`}>
                                              {val === null ? "—" : `${val.toFixed(1)}%`}
                                            </div>
                                            {showPersonal && (
                                              <div className={`text-[10px] tabular-nums ${placeTone(pv, baselines[p], p + 1)}`}>
                                                {pv === null ? "—" : `you ${pv.toFixed(0)}%`}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                    {u.n > 0 && (
                                      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-muted/40">
                                        {[0, 1, 2, 3].map((p) => (
                                          <div
                                            key={p}
                                            className={PLACE_BAR[p]}
                                            style={{ width: `${pct(u.places[p])}%` }}
                                          />
                                        ))}
                                      </div>
                                    )}
                                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground tabular-nums">
                                      <span>
                                        Share <span className="text-foreground">{totalUp ? `${gShare.toFixed(1)}%` : "—"}</span>
                                        {showPersonal && pu.n && personalMeta.upgradeTotal ? (
                                          <span className="ml-1">(you {((pu.n / personalMeta.upgradeTotal) * 100).toFixed(0)}%)</span>
                                        ) : null}
                                      </span>
                                      <span>
                                        Win <span className={placeTone(u.n ? gWin : null, baselines[0], 1)}>{u.n ? `${gWin.toFixed(1)}%` : "—"}</span>
                                        {showPersonal && pu.n ? <span className="ml-1">(you {((pu.wins / pu.n) * 100).toFixed(0)}%)</span> : null}
                                      </span>
                                      <span>
                                        Avg <span className="text-foreground">{u.n ? gPlace.toFixed(2) : "—"}</span>
                                        {showPersonal && pu.n ? <span className="ml-1">(you {(pu.placementSum / pu.n).toFixed(2)})</span> : null}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </Card>

                      <Card className="p-5 border-border/60 bg-card/70 shadow-arena">
                        <div className="flex items-center gap-2 font-display text-lg text-sand mb-3">
                          <Timer className="size-4" /> Game pacing
                        </div>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                              <th className="py-2 text-left">Ends</th>
                              <th className="py-2 text-right">Games</th>
                              {showPersonal && <th className="py-2 text-right">You</th>}
                              <th className="py-2 text-right">Share</th>
                              {showPersonal && <th className="py-2 text-right">You</th>}
                              <th className="py-2 text-right">Avg win score</th>
                              {showPersonal && <th className="py-2 text-right">You</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {meta.pace.map((p, pi) => {
                              const pp = personalMeta.pace[pi];
                              const gShare = meta.paceKnown ? (p.games / meta.paceKnown) * 100 : 0;
                              const gScore = p.winScoreN ? p.winScoreSum / p.winScoreN : 0;
                              return (
                              <tr key={p.label} className="border-t border-border/40">
                                <td className="py-2">{p.label}</td>
                                <td className="py-2 text-right tabular-nums">{p.games}</td>
                                {showPersonal && <td className="py-2 text-right tabular-nums">{pp.games ? pp.games : <span className="text-muted-foreground/60">—</span>}</td>}
                                <td className="py-2 text-right tabular-nums">
                                  {meta.paceKnown ? `${gShare.toFixed(1)}%` : "—"}
                                </td>
                                {showPersonal && <td className="py-2 text-right tabular-nums">{personalCell(pp.games && personalMeta.paceKnown ? (pp.games / personalMeta.paceKnown) * 100 : null, gShare, "%")}</td>}
                                <td className="py-2 text-right tabular-nums">
                                  {p.winScoreN ? gScore.toFixed(1) : "—"}
                                </td>
                                {showPersonal && <td className="py-2 text-right tabular-nums">{personalCell(pp.winScoreN ? pp.winScoreSum / pp.winScoreN : null, gScore, "")}</td>}
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        <p className="text-xs text-muted-foreground mt-2">
                          Based on {meta.paceKnown} games with a recorded end round.
                          {showPersonal && personalMeta.paceKnown > 0 && ` Your sample: ${personalMeta.paceKnown} games.`}
                        </p>
                      </Card>

                      <Card className="p-5 border-border/60 bg-card/70 shadow-arena md:col-span-2">
                        <div className="flex items-center gap-2 font-display text-lg text-sand mb-3">
                          <Swords className="size-4" /> Final conflicts
                        </div>
                        {meta.conflicts.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No games with a recorded final conflict yet.</p>
                        ) : (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                                <th className="py-2 text-left">Conflict</th>
                                <th className="py-2 text-left">Seen in</th>
                                <th className="py-2 text-right">Times last</th>
                                <th className="py-2 text-right">Share</th>
                                <th className="py-2 text-right">Round ≤6</th>
                                <th className="py-2 text-right">Round 7</th>
                                <th className="py-2 text-right">Round 8</th>
                                <th className="py-2 text-right">Round 9+</th>
                              </tr>
                            </thead>
                            <tbody>
                              {meta.conflicts.map((c) => (
                                <tr key={c.label} className="border-t border-border/40">
                                  <td className="py-2">{c.label}</td>
                                  <td className="py-2">
                                    <span className="inline-flex flex-wrap gap-1">
                                      {c.versions.map((v) => (
                                        <span key={v} className="rounded border border-border/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                                          {v === "ix" ? "Ix" : v === "uprising" ? "Uprising" : "Base"}
                                        </span>
                                      ))}
                                    </span>
                                  </td>
                                  <td className="py-2 text-right tabular-nums">{c.total}</td>
                                  <td className="py-2 text-right tabular-nums">
                                    {meta.conflictTotal ? `${((c.total / meta.conflictTotal) * 100).toFixed(1)}%` : "—"}
                                  </td>
                                  <td className="py-2 text-right tabular-nums">{c.early || <span className="text-muted-foreground/60">—</span>}</td>
                                  <td className="py-2 text-right tabular-nums">{c.r7 || <span className="text-muted-foreground/60">—</span>}</td>
                                  <td className="py-2 text-right tabular-nums">{c.r8 || <span className="text-muted-foreground/60">—</span>}</td>
                                  <td className="py-2 text-right tabular-nums">{c.r9 || <span className="text-muted-foreground/60">—</span>}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                          Based on {meta.conflictTotal} games with a recorded final conflict. "Round ≤6" counts games that ended on round 6 or earlier.
                        </p>
                      </Card>


                      <Card className="p-5 border-border/60 bg-card/70 shadow-arena">
                        <div className="flex items-center gap-2 font-display text-lg text-sand mb-3">
                          <Landmark className="size-4" /> Faction track dynamics
                        </div>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                              <th className="py-2 text-left">Faction</th>
                              <th className="py-2 text-right">Alliance claimed</th>
                              {showPersonal && <th className="py-2 text-right">You</th>}
                              <th className="py-2 text-right">Unclaimed</th>
                              <th className="py-2 text-right">Avg level</th>
                              {showPersonal && <th className="py-2 text-right">You</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {FACTION_KEYS.map((f) => {
                              const claimed = meta.allianceGames[f];
                              const pct = meta.allianceGameN ? (claimed / meta.allianceGameN) * 100 : null;
                              const pPct = personalMeta.allianceGameN ? (personalMeta.allianceGames[f] / personalMeta.allianceGameN) * 100 : null;
                              const gLvl = meta.factionLevelN[f] ? meta.factionLevelSum[f] / meta.factionLevelN[f] : null;
                              const pLvl = personalMeta.factionLevelN[f] ? personalMeta.factionLevelSum[f] / personalMeta.factionLevelN[f] : null;
                              return (
                                <tr key={f} className="border-t border-border/40">
                                  <td className="py-2">{FACTION_LABEL[f]}</td>
                                  <td className="py-2 text-right tabular-nums">{pct === null ? "—" : `${pct.toFixed(1)}%`}</td>
                                  {showPersonal && <td className="py-2 text-right tabular-nums">{personalCell(pPct, pct ?? 0, "%")}</td>}
                                  <td className="py-2 text-right tabular-nums">{pct === null ? "—" : `${(100 - pct).toFixed(1)}%`}</td>
                                  <td className="py-2 text-right tabular-nums">{gLvl === null ? "—" : gLvl.toFixed(2)}</td>
                                  {showPersonal && <td className="py-2 text-right tabular-nums">{personalCell(pLvl, gLvl ?? 0, "", 2)}</td>}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        <div className="mt-4 pt-3 border-t border-border/40 flex items-baseline justify-between">
                          <span className="text-sm text-muted-foreground">Stranded bumps</span>
                          <span className="font-display text-xl text-sand tabular-nums">
                            {meta.strandedPct === null ? "—" : `${meta.strandedPct.toFixed(1)}%`}
                            {showPersonal && personalMeta.strandedPct !== null && (
                              <span className={`ml-2 text-sm ${toneClass(personalMeta.strandedPct, meta.strandedPct ?? 0) === "text-emerald-400" ? "text-red-400" : toneClass(personalMeta.strandedPct, meta.strandedPct ?? 0) === "text-red-400" ? "text-emerald-400" : "text-muted-foreground"}`}>
                                (you: {personalMeta.strandedPct.toFixed(1)}%)
                              </span>
                            )}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Share of all track investments left on dead levels (level 1, level 3 without alliance, or levels 4/5 without alliance).
                        </p>
                      </Card>

                      <Card className="p-5 border-border/60 bg-card/70 shadow-arena md:col-span-2">
                        <div className="flex items-center gap-2 font-display text-lg text-sand mb-3">
                          <Landmark className="size-4" /> Alliances vs placement
                        </div>
                        {(() => {
                          const totalSeats = meta.allianceSeatN;
                          const baselines = [0, 1, 2, 3].map((p) =>
                            totalSeats ? (meta.allianceSeatPlaces[p] / totalSeats) * 100 : 0,
                          );
                          const labels = ["1st", "2nd", "3rd", "4th"];
                          return (
                            <>
                              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {meta.allianceEffect.map((u, ui) => {
                                  const pu = personalMeta.allianceEffect[ui];
                                  const pct = (v: number) => (u.n ? (v / u.n) * 100 : 0);
                                  const gShare = totalSeats ? (u.n / totalSeats) * 100 : 0;
                                  const gWin = u.n ? (u.wins / u.n) * 100 : 0;
                                  const gPlace = u.n ? u.placementSum / u.n : 0;
                                  return (
                                    <div key={u.label} className="rounded-lg border border-border/60 bg-background/30 p-3">
                                      <div className="flex items-baseline justify-between mb-2">
                                        <div className="font-display text-sm">{u.label}</div>
                                        <div className="text-xs text-muted-foreground tabular-nums">
                                          {u.n} seats{showPersonal && pu.n ? ` · you ${pu.n}` : ""}
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-4 gap-1 text-center">
                                        {labels.map((lb, p) => {
                                          const val = u.n ? pct(u.places[p]) : null;
                                          const pv = pu.n ? (pu.places[p] / pu.n) * 100 : null;
                                          return (
                                            <div key={lb} className="rounded-md bg-card/60 py-1.5">
                                              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{lb}</div>
                                              <div className={`text-base font-display tabular-nums ${placeTone(val, baselines[p], p + 1)}`}>
                                                {val === null ? "—" : `${val.toFixed(1)}%`}
                                              </div>
                                              {showPersonal && (
                                                <div className={`text-[10px] tabular-nums ${placeTone(pv, baselines[p], p + 1)}`}>
                                                  {pv === null ? "—" : `you ${pv.toFixed(0)}%`}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                      {u.n > 0 && (
                                        <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-muted/40">
                                          {[0, 1, 2, 3].map((p) => (
                                            <div key={p} className={PLACE_BAR[p]} style={{ width: `${pct(u.places[p])}%` }} />
                                          ))}
                                        </div>
                                      )}
                                      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground tabular-nums">
                                        <span>
                                          Share <span className="text-foreground">{totalSeats ? `${gShare.toFixed(1)}%` : "—"}</span>
                                          {showPersonal && pu.n && personalMeta.allianceSeatN ? (
                                            <span className="ml-1">(you {((pu.n / personalMeta.allianceSeatN) * 100).toFixed(0)}%)</span>
                                          ) : null}
                                        </span>
                                        <span>
                                          Win <span className={placeTone(u.n ? gWin : null, baselines[0], 1)}>{u.n ? `${gWin.toFixed(1)}%` : "—"}</span>
                                          {showPersonal && pu.n ? <span className="ml-1">(you {((pu.wins / pu.n) * 100).toFixed(0)}%)</span> : null}
                                        </span>
                                        <span>
                                          Avg <span className="text-foreground">{u.n ? gPlace.toFixed(2) : "—"}</span>
                                          {showPersonal && pu.n ? <span className="ml-1">(you {(pu.placementSum / pu.n).toFixed(2)})</span> : null}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              <p className="text-xs text-muted-foreground mt-3">
                                Based on {totalSeats} player seats. A seat holding several alliances counts in each of those factions, so shares add up past 100%.
                              </p>
                            </>
                          );
                        })()}
                      </Card>
                    </div>
                  )}
                </>

              ) : (
                <>
              <Card className="p-0 overflow-hidden border-border/60 bg-card/70 shadow-arena">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="px-4 py-3 text-left">Leader</th>
                        <SortTh label="Picks" k="picks" />
                        {showPersonal && <SortTh label="You" k="youPicks" />}
                        <SortTh label="Pick %" k="pickPct" />
                        {showPersonal && <SortTh label="You" k="youPickPct" />}
                        <SortTh label="Wins" k="wins" />
                        {showPersonal && <SortTh label="You" k="youWins" />}
                        <SortTh label="Win %" k="winPct" />
                        {showPersonal && <SortTh label="You" k="youWinPct" />}
                        <SortTh label="Top 2 %" k="top2Pct" className="hidden sm:table-cell" />
                        {showPersonal && <SortTh label="You" k="youTop2Pct" className="hidden sm:table-cell" />}
                        <SortTh label="Avg pts" k="avgPts" className="hidden md:table-cell" />
                        {showPersonal && <SortTh label="You" k="youAvgPts" className="hidden md:table-cell" />}
                      </tr>
                    </thead>
                    <tbody>
                      {loading && (
                        <tr>
                          <td colSpan={showPersonal ? 13 : 7} className="py-10 text-center text-muted-foreground">
                            Loading stats…
                          </td>
                        </tr>
                      )}
                      {!loading &&
                        sorted.map((a) => {
                          const pickPct = totalGames ? (a.picks / totalGames) * 100 : 0;
                          const winPct = a.picks ? (a.wins / a.picks) * 100 : 0;
                          const top2Pct = a.picks ? (a.top2 / a.picks) * 100 : 0;
                          const avgPts = a.picks ? a.totalPoints / a.picks : 0;
                          const mine = userLeaders.has(a.leader);
                          const p = personalAgg.get(a.leader);
                          const pPickPct = p && personalTotalSlots ? (p.picks / personalTotalSlots) * 100 : null;
                          const pWinPct = p && p.picks ? (p.wins / p.picks) * 100 : null;
                          const pTop2Pct = p && p.picks ? (p.top2 / p.picks) * 100 : null;
                          const pAvgPts = p && p.picks ? p.totalPoints / p.picks : null;
                          return (
                            <tr key={a.leader} className={`border-t border-border/40 hover:bg-secondary/30 ${mine ? "bg-sand/10 ring-1 ring-inset ring-sand/60" : ""}`}>
                              <td className={`px-4 py-3 font-medium ${GROUP_COLOR[a.group]}`}>
                                {(() => {
                                  const r = leaderRouteFor(a.leader);
                                  return r ? (
                                    <Link to="/leaders/$origin/$slug" params={{ origin: r.origin, slug: r.slug }} className="hover:underline">
                                      {a.leader}
                                    </Link>
                                  ) : a.leader;
                                })()}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums">{a.picks}</td>
                              {showPersonal && <td className="px-4 py-3 text-right tabular-nums">{p ? p.picks : <span className="text-muted-foreground/60">—</span>}</td>}
                              <td className="px-4 py-3 text-right tabular-nums">{pickPct.toFixed(1)}%</td>
                              {showPersonal && <td className="px-4 py-3 text-right tabular-nums">{personalCell(pPickPct, pickPct, "%")}</td>}
                              <td className="px-4 py-3 text-right tabular-nums">{a.wins}</td>
                              {showPersonal && <td className="px-4 py-3 text-right tabular-nums">{p ? p.wins : <span className="text-muted-foreground/60">—</span>}</td>}
                              <td className="px-4 py-3 text-right tabular-nums">{winPct.toFixed(1)}%</td>
                              {showPersonal && <td className="px-4 py-3 text-right tabular-nums">{personalCell(pWinPct, winPct, "%")}</td>}
                              <td className="px-4 py-3 text-right tabular-nums hidden sm:table-cell">
                                {top2Pct.toFixed(1)}%
                              </td>
                              {showPersonal && <td className="px-4 py-3 text-right tabular-nums hidden sm:table-cell">{personalCell(pTop2Pct, top2Pct, "%")}</td>}
                              <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                                {avgPts.toFixed(1)}
                              </td>
                              {showPersonal && <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">{personalCell(pAvgPts, avgPts, "")}</td>}
                            </tr>
                          );
                        })}
                      {!loading && aggregates.length === 0 && (
                        <tr>
                          <td colSpan={showPersonal ? 13 : 7} className="py-10 text-center text-muted-foreground">
                            No data for {v.label} yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
              <p className="text-xs text-muted-foreground mt-3">
                Based on {totalGamesCount} games played in {v.label}.
                {showPersonal && personalTotalSlots > 0 && ` Your personal sample: ${personalTotalSlots} seats.`}
              </p>
                </>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
