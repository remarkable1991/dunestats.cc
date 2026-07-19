import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { GAME_VERSIONS, type GameVersion } from "@/lib/game-version";
import { LEADERS, classifyLeader } from "@/lib/leaders";
import { BarChart3, ArrowUp, ArrowDown, ArrowUpDown, UserCheck } from "lucide-react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

type TriState = "any" | "true" | "false";

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
  games: {
    id: string;
    game_version: GameVersion;
    has_rise_of_ix: boolean | null;
    has_epic_mode: boolean | null;
    has_immortality: boolean | null;
    has_base_leaders: boolean | null;
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
  const [userLeaders, setUserLeaders] = useState<Set<string>>(new Set());
  const [playerKeys, setPlayerKeys] = useState<string[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [compare, setCompare] = useState(false);
  const [fEpic, setFEpic] = useState<TriState>("any");
  const [fImmortality, setFImmortality] = useState<TriState>("any");
  const [fBaseLeaders, setFBaseLeaders] = useState<TriState>("any");
  const [fRiseOfIx, setFRiseOfIx] = useState<TriState>("any");

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
          .select("placement, leader_name, player_name, points, games!inner(id, game_version, has_rise_of_ix, has_epic_mode, has_immortality, has_base_leaders)")
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
  const playerKeySet = useMemo(() => new Set(playerKeys.map((k) => k.toLowerCase())), [playerKeys]);

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

      if (showPersonal && r.player_name && playerKeySet.has(r.player_name.toLowerCase())) {
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

  const personalCell = (personal: number | null, global: number, suffix = "", digits = 1) => {
    if (personal === null) {
      return <span className="text-muted-foreground/60">—</span>;
    }
    return <span className={toneClass(personal, global)}>{personal.toFixed(digits)}{suffix}</span>;
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
              <Card className="p-0 overflow-hidden border-border/60 bg-card/70 shadow-arena">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="px-4 py-3 text-left">Leader</th>
                        <th className="px-4 py-3 text-left">Group</th>
                        <SortTh label="Picks" k="picks" />
                        {showPersonal && <th className="px-4 py-3 text-right">You</th>}
                        <SortTh label="Pick %" k="pickPct" />
                        {showPersonal && <th className="px-4 py-3 text-right">You</th>}
                        <SortTh label="Wins" k="wins" />
                        {showPersonal && <th className="px-4 py-3 text-right">You</th>}
                        <SortTh label="Win %" k="winPct" />
                        {showPersonal && <th className="px-4 py-3 text-right">You</th>}
                        <SortTh label="Top 2 %" k="top2Pct" className="hidden sm:table-cell" />
                        {showPersonal && <th className="px-4 py-3 text-right hidden sm:table-cell">You</th>}
                        <SortTh label="Avg pts" k="avgPts" className="hidden md:table-cell" />
                        {showPersonal && <th className="px-4 py-3 text-right hidden md:table-cell">You</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {loading && (
                        <tr>
                          <td colSpan={showPersonal ? 14 : 8} className="py-10 text-center text-muted-foreground">
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
                              <td className="px-4 py-3 font-medium">{a.leader}</td>
                              <td className="px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground">
                                {a.group}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums">{a.picks}</td>
                              {showPersonal && <td className="px-4 py-3 text-right tabular-nums">{p ? <span className={toneClass(p.picks, 0)}>{p.picks}</span> : <span className="text-muted-foreground/60">—</span>}</td>}
                              <td className="px-4 py-3 text-right tabular-nums text-sand">{pickPct.toFixed(1)}%</td>
                              {showPersonal && <td className="px-4 py-3 text-right tabular-nums">{personalCell(pPickPct, pickPct, "%")}</td>}
                              <td className="px-4 py-3 text-right tabular-nums">{a.wins}</td>
                              {showPersonal && <td className="px-4 py-3 text-right tabular-nums">{p ? <span className={toneClass(p.wins, 0)}>{p.wins}</span> : <span className="text-muted-foreground/60">—</span>}</td>}
                              <td className="px-4 py-3 text-right tabular-nums text-coral">{winPct.toFixed(1)}%</td>
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
                          <td colSpan={showPersonal ? 14 : 8} className="py-10 text-center text-muted-foreground">
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
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
