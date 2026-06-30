import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { GAME_VERSIONS, type GameVersion } from "@/lib/game-version";
import { LEADERS, classifyLeader } from "@/lib/leaders";
import { BarChart3, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

export const Route = createFileRoute("/stats")({
  head: () => ({ meta: [{ title: "Leader stats · Strategy Arena" }] }),
  component: StatsPage,
});

type Row = {
  placement: number;
  leader_name: string | null;
  points: number;
  games: {
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
  // Try exact match first
  if (CANON.has(n)) {
    const name = CANON.get(n)!;
    const g = classifyLeader(name);
    return { name, group: g ?? "other" };
  }
  // Substring against canonical lower-case
  for (const [key, name] of CANON) {
    if (n.includes(key) || key.includes(n)) {
      const g = classifyLeader(name);
      return { name, group: g ?? "other" };
    }
  }
  const g = classifyLeader(raw);
  return { name: raw, group: g ?? "other" };
}

function StatsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState<GameVersion>("overall");
  const [userLeaders, setUserLeaders] = useState<Set<string>>(new Set());
  type TriState = "any" | "true" | "false";
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
  type SortKey = "picks" | "pickPct" | "wins" | "winPct" | "top2Pct" | "avgPts";
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"desc" | "asc" | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) return;
      const { data: claims } = await supabase
        .from("player_ratings")
        .select("player_key")
        .eq("claimed_by", uid);
      const keys = Array.from(new Set((claims ?? []).map((c) => c.player_key)));
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

  useEffect(() => {
    setLoading(true);
    (async () => {
      const PAGE = 1000;
      const out: Row[] = [];
      let from = 0;
      // Loop until we've fetched everything
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from("game_results")
          .select("placement, leader_name, points, games!inner(game_version, has_rise_of_ix, has_epic_mode, has_immortality, has_base_leaders)")
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

  const { aggregates, totalGames } = useMemo(() => {
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
    // Count distinct games is tricky without IDs; pick count = total rows / avg players. Use sum/4 estimate via leader picks summing to total player slots.
    // For pick rate we use share of player-slots in this version.
    const totalSlots = filtered.length;
    const map = new Map<string, Agg>();
    for (const r of filtered) {
      const c = canonicalize(r.leader_name);
      if (!c) continue;
      const key = c.name;
      const a = map.get(key) ?? {
        leader: c.name,
        group: c.group,
        picks: 0,
        wins: 0,
        top2: 0,
        totalPoints: 0,
      };
      a.picks += 1;
      if (r.placement === 1) a.wins += 1;
      if (r.placement <= 2) a.top2 += 1;
      a.totalPoints += r.points;
      map.set(key, a);
    }
    const aggregates = Array.from(map.values()).sort((a, b) => b.picks - a.picks);
    return { aggregates, totalGames: totalSlots };
  }, [rows, version, fEpic, fImmortality, fBaseLeaders, fRiseOfIx]);

  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return aggregates;
    const dir = sortDir === "desc" ? -1 : 1;
    const score = (a: Agg) => {
      switch (sortKey) {
        case "picks": return a.picks;
        case "pickPct": return totalGames ? a.picks / totalGames : 0;
        case "wins": return a.wins;
        case "winPct": return a.picks ? a.wins / a.picks : 0;
        case "top2Pct": return a.picks ? a.top2 / a.picks : 0;
        case "avgPts": return a.picks ? a.totalPoints / a.picks : 0;
      }
    };
    return [...aggregates].sort((a, b) => {
      const av = score(a), bv = score(b);
      if (av === bv) return a.leader.localeCompare(b.leader);
      return av < bv ? dir : -dir;
    });
  }, [aggregates, sortKey, sortDir, totalGames]);

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
              <Card className="p-0 overflow-hidden border-border/60 bg-card/70 shadow-arena">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="px-4 py-3 text-left">Leader</th>
                        <th className="px-4 py-3 text-left">Group</th>
                        <SortTh label="Picks" k="picks" />
                        <SortTh label="Pick %" k="pickPct" />
                        <SortTh label="Wins" k="wins" />
                        <SortTh label="Win %" k="winPct" />
                        <SortTh label="Top 2 %" k="top2Pct" className="hidden sm:table-cell" />
                        <SortTh label="Avg pts" k="avgPts" className="hidden md:table-cell" />
                      </tr>
                    </thead>
                    <tbody>
                      {loading && (
                        <tr>
                          <td colSpan={8} className="py-10 text-center text-muted-foreground">
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
                          return (
                            <tr key={a.leader} className={`border-t border-border/40 hover:bg-secondary/30 ${mine ? "bg-sand/10 ring-1 ring-inset ring-sand/60" : ""}`}>
                              <td className="px-4 py-3 font-medium">{a.leader}</td>
                              <td className="px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground">
                                {a.group}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums">{a.picks}</td>
                              <td className="px-4 py-3 text-right tabular-nums text-sand">{pickPct.toFixed(1)}%</td>
                              <td className="px-4 py-3 text-right tabular-nums">{a.wins}</td>
                              <td className="px-4 py-3 text-right tabular-nums text-coral">{winPct.toFixed(1)}%</td>
                              <td className="px-4 py-3 text-right tabular-nums hidden sm:table-cell">
                                {top2Pct.toFixed(1)}%
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                                {avgPts.toFixed(1)}
                              </td>
                            </tr>
                          );
                        })}
                      {!loading && aggregates.length === 0 && (
                        <tr>
                          <td colSpan={8} className="py-10 text-center text-muted-foreground">
                            No data for {v.label} yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
              <p className="text-xs text-muted-foreground mt-3">
                Based on {totalGames} player-seat results in {v.label}.
              </p>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}