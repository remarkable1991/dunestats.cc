import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { SupabaseImage } from "@/components/SupabaseImage";
import { signedUrlOrR2 } from "@/lib/storage-r2";
import { useEffect, useMemo, useRef, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { GAME_VERSIONS, type GameVersion } from "@/lib/game-version";
import {
  influenceEfficiency,
  FACTION_KEYS,
  FACTION_ALLIANCE_KEYS,
  FACTION_LEVEL_KEYS,
  type FactionKey,
} from "@/lib/match-telemetry";

const FACTION_LABEL: Record<FactionKey, string> = {
  emperor: "Emperor",
  spacing_guild: "Spacing Guild",
  bene_gesserit: "Bene Gesserit",
  fremen: "Fremen",
};
import {
  findLeader,
  leaderSlug,
  ORIGIN_COLOR,
  ORIGIN_LABEL,
  type LeaderOrigin,
} from "@/lib/leader-slug";
import { LEADERS } from "@/lib/leaders";
import { ImagePlus, Upload, X } from "lucide-react";

export const Route = createFileRoute("/leaders/$origin/$slug")({
  head: ({ params }) => {
    const leader = findLeader(params.origin, params.slug);
    const title = leader ? `${leader.name} · Leader stats` : "Leader · Strategy Arena";
    const desc = leader
      ? `Placement, win rate and pick rate for ${leader.name} in Dune Imperium.`
      : "Detailed leader stats.";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
      ],
    };
  },
  component: LeaderDetail,
});

type Row = {
  placement: number;
  points: number;
  leader_name: string | null;
  player_name?: string | null;
  spice?: number | null;
  solaris?: number | null;
  water?: number | null;
  turn_order?: number | null;
  player_slot?: number | null;
  has_high_council?: boolean | null;
  has_swordmaster?: boolean | null;
  emperor_level?: number | null;
  emperor_alliance?: boolean | null;
  spacing_guild_level?: number | null;
  spacing_guild_alliance?: boolean | null;
  bene_gesserit_level?: number | null;
  bene_gesserit_alliance?: boolean | null;
  fremen_level?: number | null;
  fremen_alliance?: boolean | null;
  games: {
    id: string;
    game_version: GameVersion;
    has_immortality: boolean;
    has_epic_mode: boolean;
    has_rise_of_ix: boolean;
    ai_scan_status?: string | null;
  } | null;
};

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collectAliases(name: string): string[] {
  const norm = normalize(name);
  const out = new Set<string>([norm]);
  // Handle the Jessica alias: Reverend Mother Jessica <-> Lady Jessica share stats.
  if (norm.includes("jessica")) {
    out.add(normalize("Lady Jessica"));
    out.add(normalize("Reverend Mother Jessica"));
  }
  return [...out];
}

const ORIGIN_TO_VERSION: Record<LeaderOrigin, GameVersion> = {
  base: "base",
  "rise-of-ix": "ix",
  uprising: "uprising",
};

function versionsForOrigin(origin: LeaderOrigin): GameVersion[] {
  // A leader can appear in its native set + any set that includes it.
  // Base leaders play in Base, Rise of Ix (expansion added to base game), and Uprising (with base-leaders flag).
  if (origin === "base") return ["overall", "base", "ix", "uprising"];
  if (origin === "rise-of-ix") return ["overall", "ix", "uprising"];
  return ["overall", "uprising"];
}

function LeaderDetail() {
  const { origin, slug } = Route.useParams();
  const navigate = useNavigate();
  const leader = findLeader(origin, slug);

  const [rows, setRows] = useState<Row[]>([]);
  const [advGames, setAdvGames] = useState<Row[][]>([]);
  const [allSeats, setAllSeats] = useState<
    { leader_name: string | null; gameId: string | null; version: GameVersion | null; immo: boolean; epic: boolean; ix: boolean }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState<GameVersion>("overall");
  const [isAdmin, setIsAdmin] = useState(false);
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);
  const [cardUrl, setCardUrl] = useState<string | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const portraitInput = useRef<HTMLInputElement>(null);
  const cardInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<"portrait" | "card" | null>(null);

  // set default version to leader's native origin
  useEffect(() => {
    if (leader) setVersion(ORIGIN_TO_VERSION[leader.origin]);
  }, [leader?.name]);

  // admin check
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) return;
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid);
      setIsAdmin((roles ?? []).some((r) => r.role === "admin"));
    })();
  }, []);

  // load stats
  useEffect(() => {
    if (!leader) return;
    setLoading(true);
    const aliases = collectAliases(leader.name);
    (async () => {
      const PAGE = 1000;
      const out: Row[] = [];
      const seats: typeof allSeats = [];
      const all: Row[] = [];
      let from = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from("game_results")
          .select(
            "placement, points, leader_name, player_name, spice, solaris, water, turn_order, player_slot, has_high_council, has_swordmaster, emperor_level, emperor_alliance, spacing_guild_level, spacing_guild_alliance, bene_gesserit_level, bene_gesserit_alliance, fremen_level, fremen_alliance, games!inner(id, game_version, has_immortality, has_epic_mode, has_rise_of_ix, ai_scan_status)",
          )
          .range(from, from + PAGE - 1);
        if (error || !data || data.length === 0) break;
        for (const r of data as unknown as Row[]) {
          if (!r.leader_name) continue;
          all.push(r);
          seats.push({
            leader_name: r.leader_name,
            gameId: r.games?.id ?? null,
            version: r.games?.game_version ?? null,
            immo: !!r.games?.has_immortality,
            epic: !!r.games?.has_epic_mode,
            ix: !!r.games?.has_rise_of_ix,
          });
          if (aliases.includes(normalize(r.leader_name))) out.push(r);
        }
        if (data.length < PAGE) break;
        from += PAGE;
      }
      // Keep full game rows (all seats) for every game this leader played in,
      // so influence efficiency can compare against rivals.
      const leaderGameIds = new Set(out.map((r) => r.games?.id).filter(Boolean) as string[]);
      const byGame = new Map<string, Row[]>();
      for (const r of all) {
        const gid = r.games?.id;
        if (!gid || !leaderGameIds.has(gid)) continue;
        const arr = byGame.get(gid) ?? [];
        arr.push(r);
        byGame.set(gid, arr);
      }
      setAdvGames(Array.from(byGame.values()));
      setRows(out);
      setAllSeats(seats);
      setLoading(false);
    })();
  }, [leader?.name]);

  // load images (signed URLs)
  const loadImages = async () => {
    if (!leader) return;
    const [p, c] = await Promise.all([
      signedUrlOrR2("leader-portraits", `${leader.slug}.jpg`, 3600),
      signedUrlOrR2("leader-cards", `${leader.slug}.jpg`, 3600),
    ]);
    setPortraitUrl(p);
    setCardUrl(c);
  };
  useEffect(() => {
    loadImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leader?.name]);

  const totalPickRateDenominator = useMemo(() => {
    // pick % denominator: number of game_results seats for that version (approximate — we only have this leader's rows).
    // Better: fetch total. For now compute pickRate via a lightweight query when leader loads.
    return null as number | null;
  }, [rows, version]);

  const [seatsByVersion, setSeatsByVersion] = useState<Record<string, number | null>>({});
  useEffect(() => {
    (async () => {
      const versions: GameVersion[] = ["overall", "base", "ix", "uprising"];
      const entries = await Promise.all(
        versions.map(async (v) => {
          let q = supabase.from("game_results").select("id, games!inner(game_version)", { count: "exact", head: true });
          if (v !== "overall") q = q.eq("games.game_version", v);
          const { count } = await q;
          return [v, count ?? null] as const;
        }),
      );
      setSeatsByVersion(Object.fromEntries(entries));
    })();
  }, []);
  const totalSeats = seatsByVersion[version] ?? null;

  // ---------- Interactive filters ----------
  const [filterImmo, setFilterImmo] = useState(false);
  const [filterEpic, setFilterEpic] = useState(false);
  const [filterIx, setFilterIx] = useState(false);
  const [coLeader, setCoLeader] = useState<string>("");
  const [coLeaderGameIds, setCoLeaderGameIds] = useState<Set<string> | null>(null);
  const [coLeaderLoading, setCoLeaderLoading] = useState(false);

  // Fetch the set of game ids the selected co-leader played in (lazy, cached per selection).
  useEffect(() => {
    if (!coLeader) {
      setCoLeaderGameIds(null);
      return;
    }
    let cancelled = false;
    setCoLeaderLoading(true);
    const aliases = collectAliases(coLeader);
    const ids = new Set<string>();
    (async () => {
      const PAGE = 1000;
      let from = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from("game_results")
          .select("leader_name, games!inner(id)")
          .range(from, from + PAGE - 1);
        if (error || !data || data.length === 0) break;
        for (const r of data as unknown as { leader_name: string | null; games: { id: string } | null }[]) {
          if (r.leader_name && r.games && aliases.includes(normalize(r.leader_name))) ids.add(r.games.id);
        }
        if (data.length < PAGE) break;
        from += PAGE;
      }
      if (!cancelled) {
        setCoLeaderGameIds(ids);
        setCoLeaderLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [coLeader]);

  const filteredRows = useMemo(() => {
    let out = rows;
    if (filterImmo) out = out.filter((r) => r.games?.has_immortality);
    if (filterEpic) out = out.filter((r) => r.games?.has_epic_mode);
    if (filterIx) out = out.filter((r) => r.games?.has_rise_of_ix);
    if (coLeader) {
      if (!coLeaderGameIds) return [];
      out = out.filter((r) => r.games && coLeaderGameIds.has(r.games.id));
    }
    return out;
  }, [rows, filterImmo, filterEpic, filterIx, coLeader, coLeaderGameIds]);

  const filtersActive = filterImmo || filterEpic || filterIx || !!coLeader;

  // Games relevant to the current filter context (version tab + expansion toggles,
  // excluding the co-leader selection so the dropdown itself stays useful).
  const contextGameIds = useMemo(() => {
    let source = rows;
    if (filterImmo) source = source.filter((r) => r.games?.has_immortality);
    if (filterEpic) source = source.filter((r) => r.games?.has_epic_mode);
    if (filterIx) source = source.filter((r) => r.games?.has_rise_of_ix);
    if (version !== "overall") source = source.filter((r) => r.games?.game_version === version);
    const ids = new Set<string>();
    for (const r of source) if (r.games?.id) ids.add(r.games.id);
    return ids;
  }, [rows, filterImmo, filterEpic, filterIx, version]);

  // Co-leader counts: for every other leader, how many of the context games they appeared in.
  const coLeaderCounts = useMemo(() => {
    if (!leader) return [] as { name: string; count: number }[];
    const selfAliases = collectAliases(leader.name);
    const candidates = [...LEADERS.base, ...LEADERS.ix, ...LEADERS.uprising].filter(
      (n, i, arr) => arr.indexOf(n) === i && !selfAliases.includes(normalize(n)),
    );
    const counts = new Map<string, number>(candidates.map((n) => [n, 0]));
    const aliasMap = candidates.map((n) => ({ name: n, aliases: collectAliases(n) }));
    const countedInGame = new Set<string>();
    for (const seat of allSeats) {
      if (!seat.gameId || !contextGameIds.has(seat.gameId) || !seat.leader_name) continue;
      const norm = normalize(seat.leader_name);
      for (const c of aliasMap) {
        const key = `${seat.gameId}|${c.name}`;
        if (countedInGame.has(key)) continue;
        if (c.aliases.includes(norm)) {
          counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
          countedInGame.add(key);
        }
      }
    }
    return candidates
      .map((name) => ({ name, count: counts.get(name) ?? 0 }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [leader, allSeats, contextGameIds]);

  const computeStats = (v: GameVersion, source: Row[]) => {
    const f = v === "overall" ? source : source.filter((r) => r.games?.game_version === v);
    const total = f.length;
    const placements = [0, 0, 0, 0];
    let points = 0;
    for (const r of f) {
      if (r.placement >= 1 && r.placement <= 4) placements[r.placement - 1] += 1;
      points += r.points ?? 0;
    }
    const pct = (n: number) => (total ? (n / total) * 100 : 0);
    const seats = seatsByVersion[v] ?? null;
    return {
      total,
      firsts: placements[0],
      seconds: placements[1],
      thirds: placements[2],
      fourths: placements[3],
      firstPct: pct(placements[0]),
      secondPct: pct(placements[1]),
      thirdPct: pct(placements[2]),
      fourthPct: pct(placements[3]),
      top2Pct: pct(placements[0] + placements[1]),
      bottom2Pct: pct(placements[2] + placements[3]),
      avgPts: total ? points / total : 0,
      pickRatePct: seats ? (total / seats) * 100 : 0,
    };
  };

  const stats = useMemo(() => computeStats(version, filteredRows), [filteredRows, version, seatsByVersion]);
  const baseStats = useMemo(() => computeStats(version, rows), [rows, version, seatsByVersion]);
  const nativeVersion = ORIGIN_TO_VERSION[leader?.origin ?? "base"];
  const showCompare = leader && version !== "overall" && version !== nativeVersion;
  const compareStats = useMemo(
    () => (showCompare ? computeStats(nativeVersion, filteredRows) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredRows, version, seatsByVersion, showCompare, nativeVersion],
  );

  // ---------- Results per seat (turn order) ----------
  const seatStats = useMemo(() => {
    const f = version === "overall" ? filteredRows : filteredRows.filter((r) => r.games?.game_version === version);
    const buckets = new Map<number, { games: number; places: number[]; points: number }>();
    let known = 0;
    for (const r of f) {
      const seat = r.turn_order ?? r.player_slot ?? null;
      if (!seat || seat < 1 || seat > 6) continue;
      known += 1;
      const b = buckets.get(seat) ?? { games: 0, places: [0, 0, 0, 0], points: 0 };
      b.games += 1;
      if (r.placement >= 1 && r.placement <= 4) b.places[r.placement - 1] += 1;
      b.points += r.points ?? 0;
      buckets.set(seat, b);
    }
    const rowsOut = [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([seat, b]) => ({
        seat,
        games: b.games,
        pcts: b.places.map((n) => (b.games ? (n / b.games) * 100 : 0)),
        counts: b.places,
        top2: b.games ? ((b.places[0] + b.places[1]) / b.games) * 100 : 0,
        avgPts: b.games ? b.points / b.games : 0,
      }));
    return { known, rows: rowsOut };
  }, [filteredRows, version]);


  // ---------- Advanced stats (games with endboard scan data) ----------
  const advStats = useMemo(() => {
    if (!leader || advGames.length === 0) return null;
    const aliases = collectAliases(leader.name);
    const coIds = coLeader ? coLeaderGameIds : null;
    let games = 0;
    let hcN = 0, hcYes = 0, smN = 0, smYes = 0;
    let allianceSum = 0, allianceN = 0;
    let vpPerBumpSum = 0, vpPerBumpN = 0, productiveSum = 0, productiveN = 0;
    const factionLevelSum: Record<FactionKey, number> = { emperor: 0, spacing_guild: 0, bene_gesserit: 0, fremen: 0 };
    const factionLevelN: Record<FactionKey, number> = { emperor: 0, spacing_guild: 0, bene_gesserit: 0, fremen: 0 };
    const factionAllianceN: Record<FactionKey, number> = { emperor: 0, spacing_guild: 0, bene_gesserit: 0, fremen: 0 };

    for (const gameRows of advGames) {
      const g = gameRows[0]?.games;
      if (!g) continue;
      const st = g.ai_scan_status;
      if (!st || !st.trim() || st.trim().toLowerCase() === "no") continue;
      if (version !== "overall" && g.game_version !== version) continue;
      if (filterImmo && !g.has_immortality) continue;
      if (filterEpic && !g.has_epic_mode) continue;
      if (filterIx && !g.has_rise_of_ix) continue;
      if (coIds && !coIds.has(g.id)) continue;
      const idx = gameRows.findIndex((r) => r.leader_name && aliases.includes(normalize(r.leader_name)));
      if (idx < 0) continue;

      const players = gameRows.map((r) => ({
        placement: r.placement,
        player_name: r.player_name ?? "",
        leader_name: r.leader_name,
        points: r.points,
        spice: r.spice ?? null,
        solaris: r.solaris ?? null,
        water: r.water ?? null,
        is_leaver: null,
        player_slot: r.player_slot ?? null,
        turn_order: r.turn_order ?? null,
        player_color: null,
        has_first_player: null,
        has_high_council: r.has_high_council ?? null,
        has_swordmaster: r.has_swordmaster ?? null,
        emperor_level: r.emperor_level ?? null,
        emperor_alliance: r.emperor_alliance ?? null,
        spacing_guild_level: r.spacing_guild_level ?? null,
        spacing_guild_alliance: r.spacing_guild_alliance ?? null,
        bene_gesserit_level: r.bene_gesserit_level ?? null,
        bene_gesserit_alliance: r.bene_gesserit_alliance ?? null,
        fremen_level: r.fremen_level ?? null,
        fremen_alliance: r.fremen_alliance ?? null,
      }));

      const me = gameRows[idx];
      const eff = influenceEfficiency(players[idx], players);
      games += 1;
      if (me.has_high_council !== null && me.has_high_council !== undefined) { hcN += 1; if (me.has_high_council) hcYes += 1; }
      if (me.has_swordmaster !== null && me.has_swordmaster !== undefined) { smN += 1; if (me.has_swordmaster) smYes += 1; }
      allianceN += 1;
      allianceSum += FACTION_KEYS.filter((f) => players[idx][FACTION_ALLIANCE_KEYS[f]] === true).length;
      if (eff.vpPerBump !== null) { vpPerBumpSum += eff.vpPerBump; vpPerBumpN += 1; }
      if (eff.productivePct !== null) { productiveSum += eff.productivePct; productiveN += 1; }
      for (const f of FACTION_KEYS) {
        const lv = me[FACTION_LEVEL_KEYS[f]];
        if (lv !== null && lv !== undefined) { factionLevelSum[f] += Number(lv); factionLevelN[f] += 1; }
        if (players[idx][FACTION_ALLIANCE_KEYS[f]] === true) factionAllianceN[f] += 1;
      }
    }

    if (games === 0)
      return {
        games: 0,
        hcPct: null,
        smPct: null,
        avgAlliances: null,
        vpPerBump: null,
        productivePct: null,
        factions: FACTION_KEYS.map((f) => ({ key: f, label: FACTION_LABEL[f], avgLevel: null, alliances: 0 })),
      };
    return {
      games,
      hcPct: hcN ? (hcYes / hcN) * 100 : null,
      smPct: smN ? (smYes / smN) * 100 : null,
      avgAlliances: allianceN ? allianceSum / allianceN : null,
      vpPerBump: vpPerBumpN ? vpPerBumpSum / vpPerBumpN : null,
      productivePct: productiveN ? productiveSum / productiveN : null,
      factions: FACTION_KEYS.map((f) => ({
        key: f,
        label: FACTION_LABEL[f],
        avgLevel: factionLevelN[f] ? factionLevelSum[f] / factionLevelN[f] : null,
        alliances: factionAllianceN[f],
      })),
    };
  }, [leader, advGames, version, filterImmo, filterEpic, filterIx, coLeader, coLeaderGameIds]);

  // ---- color logic per spec ----
  const winTone = (winPct: number) => {
    if (winPct > 28) return "text-emerald-400";
    if (winPct < 22) return "text-red-400";
    return "";
  };
  const secondTone = (winPct: number, secondPct: number) => {
    if (winPct > 32) return "";
    if (winPct < 28 && secondPct < 20) return "text-amber-400";
    return "";
  };
  const bottomTone = (thirdPct: number, fourthPct: number) => {
    if (thirdPct + fourthPct > 52 || fourthPct > 26) return "text-red-400";
    return "";
  };
  const top2Tone = (firstPct: number, secondPct: number) =>
    firstPct + secondPct > 54 ? "text-emerald-400" : "";
  // Seat share vs the neutral 25% baseline (lower is better for 3rd/4th).
  const seatTone = (pctValue: number, lowerIsBetter = false) => {
    const delta = lowerIsBetter ? 25 - pctValue : pctValue - 25;
    if (delta >= 6) return "text-emerald-400";
    if (delta <= -6) return "text-red-400";
    return "";
  };

  const availableTabs = leader ? versionsForOrigin(leader.origin) : (["overall"] as GameVersion[]);

  async function uploadImage(file: File, kind: "portrait" | "card") {
    if (!leader) return;
    setUploading(kind);
    try {
      const bucket = kind === "portrait" ? "leader-portraits" : "leader-cards";
      const path = `${leader.slug}.jpg`;
      const { error } = await supabase.storage.from(bucket).upload(path, file, {
        upsert: true,
        contentType: file.type || "image/jpeg",
      });
      if (error) throw error;
      await loadImages();
    } catch (e) {
      console.error(e);
      alert("Upload failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setUploading(null);
    }
  }

  if (!leader) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="container mx-auto px-4 py-16 text-center">
          <h1 className="font-display text-3xl mb-4">Leader not found</h1>
          <p className="text-muted-foreground mb-6">We don't have a profile for /{origin}/{slug}.</p>
          <Button onClick={() => navigate({ to: "/stats" })}>Back to stats</Button>
        </div>
      </div>
    );
  }

  const originColor = ORIGIN_COLOR[leader.origin];

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-4 text-sm text-muted-foreground">
          <Link to="/stats" className="hover:text-sand underline underline-offset-2">← Leader stats</Link>
        </div>

        {/* Header row: portrait + title */}
        <div className="flex items-start gap-4 md:gap-6 mb-6">
          {/* Portrait */}
          <div className="relative w-24 h-24 md:w-40 md:h-40 aspect-square rounded-xl overflow-hidden border border-border/60 bg-card/60 shrink-0">
            {portraitUrl ? (
              <SupabaseImage bucket="leader-portraits" src={portraitUrl} alt={`${leader.name} portrait`} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full grid place-items-center text-muted-foreground">
                <ImagePlus className="size-8 opacity-50" />
              </div>
            )}
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => portraitInput.current?.click()}
                  className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity grid place-items-center text-white text-xs font-medium"
                  disabled={uploading === "portrait"}
                >
                  <Upload className="size-4 mb-1" />
                  {uploading === "portrait" ? "Uploading…" : "Upload portrait"}
                </button>
                <input
                  ref={portraitInput}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadImage(f, "portrait");
                    e.target.value = "";
                  }}
                />
              </>
            )}
          </div>

          {/* Title */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <h1 className="font-display text-2xl md:text-4xl truncate" style={{ color: originColor }}>{leader.name}</h1>
              <span
                className="text-xs uppercase tracking-wider px-2 py-1 rounded border"
                style={{ borderColor: originColor, color: originColor }}
              >
                {ORIGIN_LABEL[leader.origin]}
              </span>
            </div>
          </div>
        </div>


        {/* Version tabs */}
        <Tabs value={version} onValueChange={(v) => setVersion(v as GameVersion)}>
          <TabsList className="bg-card/60 border border-border/60 mb-4 flex-wrap h-auto">
            {GAME_VERSIONS.map((v) => {
              const enabled = availableTabs.includes(v.value);
              return (
                <TabsTrigger
                  key={v.value}
                  value={v.value}
                  disabled={!enabled}
                  className="data-[state=active]:bg-sand data-[state=active]:text-sand-foreground disabled:opacity-40"
                >
                  {v.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        {/* Interactive filters */}
        <Card className="p-3 bg-card/60 border-border/60 mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground mr-1">Filters</span>
          {(
            [
              { label: "Immortality", on: filterImmo, set: setFilterImmo },
              { label: "Epic Mode", on: filterEpic, set: setFilterEpic },
              { label: "Rise of Ix", on: filterIx, set: setFilterIx },
            ] as const
          ).map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => f.set(!f.on)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                f.on
                  ? "bg-sand text-sand-foreground border-sand"
                  : "border-border/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-muted-foreground" htmlFor="co-leader-filter">With leader:</label>
            <select
              id="co-leader-filter"
              value={coLeader}
              onChange={(e) => setCoLeader(e.target.value)}
              className="text-xs bg-background border border-border/60 rounded px-2 py-1"
            >
              <option value="">Any</option>
              {coLeaderCounts.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.count})
                </option>
              ))}
            </select>
            {coLeaderLoading && <span className="text-xs text-muted-foreground">loading…</span>}
          </div>
          {filtersActive && (
            <button
              type="button"
              onClick={() => {
                setFilterImmo(false);
                setFilterEpic(false);
                setFilterIx(false);
                setCoLeader("");
              }}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 ml-auto"
            >
              Clear filters
            </button>
          )}
        </Card>

        {/* Summary metrics */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Card className="p-4 bg-card/70 border-border/60">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Matches Played</div>
            <div className="text-2xl font-display">{loading ? "…" : stats.total}</div>
            {filtersActive && !loading && (
              <div className="text-xs text-muted-foreground mt-1">unfiltered: {baseStats.total}</div>
            )}
          </Card>
          <Card className="p-4 bg-card/70 border-border/60">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Avg Victory Pts</div>
            <div className="text-2xl font-display">{loading ? "…" : stats.avgPts.toFixed(1)}</div>
            {filtersActive && !loading && (
              <div className="text-xs text-muted-foreground mt-1">unfiltered: {baseStats.avgPts.toFixed(1)}</div>
            )}
          </Card>
          <Card className="p-4 bg-card/70 border-border/60">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Pick Rate</div>
            <div className="text-2xl font-display">{loading || totalSeats === null ? "…" : `${stats.pickRatePct.toFixed(1)}%`}</div>
            {filtersActive && !loading && totalSeats !== null && (
              <div className="text-xs text-muted-foreground mt-1">unfiltered: {baseStats.pickRatePct.toFixed(1)}%</div>
            )}
          </Card>
        </div>

        {/* Placement cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="p-4 bg-card/70 border-border/60">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">1st (Win %)</div>
            <div className={`text-2xl font-display tabular-nums ${winTone(stats.firstPct)}`}>
              {loading ? "…" : `${stats.firstPct.toFixed(1)}%`}
            </div>
            <div className="text-xs text-muted-foreground mt-1">{stats.firsts} wins</div>
            {filtersActive && !loading && (
              <div className="text-xs text-muted-foreground mt-0.5">unfiltered: {baseStats.firstPct.toFixed(1)}%</div>
            )}
          </Card>
          <Card className="p-4 bg-card/70 border-border/60">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">2nd Place</div>
            <div className={`text-2xl font-display tabular-nums ${secondTone(stats.firstPct, stats.secondPct)}`}>
              {loading ? "…" : `${stats.secondPct.toFixed(1)}%`}
            </div>
            <div className="text-xs text-muted-foreground mt-1">{stats.seconds} results</div>
            {filtersActive && !loading && (
              <div className="text-xs text-muted-foreground mt-0.5">unfiltered: {baseStats.secondPct.toFixed(1)}%</div>
            )}
          </Card>
          <Card className="p-4 bg-card/70 border-border/60">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">3rd Place</div>
            <div className={`text-2xl font-display tabular-nums ${bottomTone(stats.thirdPct, stats.fourthPct)}`}>
              {loading ? "…" : `${stats.thirdPct.toFixed(1)}%`}
            </div>
            <div className="text-xs text-muted-foreground mt-1">{stats.thirds} results</div>
            {filtersActive && !loading && (
              <div className="text-xs text-muted-foreground mt-0.5">unfiltered: {baseStats.thirdPct.toFixed(1)}%</div>
            )}
          </Card>
          <Card className="p-4 bg-card/70 border-border/60">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">4th Place</div>
            <div className={`text-2xl font-display tabular-nums ${bottomTone(stats.thirdPct, stats.fourthPct)}`}>
              {loading ? "…" : `${stats.fourthPct.toFixed(1)}%`}
            </div>
            <div className="text-xs text-muted-foreground mt-1">{stats.fourths} results</div>
            {filtersActive && !loading && (
              <div className="text-xs text-muted-foreground mt-0.5">unfiltered: {baseStats.fourthPct.toFixed(1)}%</div>
            )}
          </Card>
          <Card className="p-4 bg-card/70 border-border/60 col-span-2 md:col-span-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Top 2</div>
            <div className={`text-2xl font-display tabular-nums ${top2Tone(stats.firstPct, stats.secondPct)}`}>
              {loading ? "…" : `${stats.top2Pct.toFixed(1)}%`}
            </div>
            <div className="text-xs text-muted-foreground mt-1">1st + 2nd combined</div>
            {filtersActive && !loading && (
              <div className="text-xs text-muted-foreground mt-0.5">unfiltered: {baseStats.top2Pct.toFixed(1)}%</div>
            )}
          </Card>
        </div>

        <p className="text-xs text-muted-foreground mt-4">
          Based on {stats.total} recorded seats
          {version !== "overall" ? ` in ${GAME_VERSIONS.find((g) => g.value === version)?.label}` : ""}
          {filtersActive ? " (filtered)" : ""}.
        </p>

        {/* Advanced stats (endboard scan games) */}
        {!loading && advStats && advStats.games > 0 && (
          <div className="mt-8">
            <h2 className="font-display text-lg mb-1">Advanced stats</h2>
            <p className="text-xs text-muted-foreground mb-3">
              Influence efficiency from {advStats.games} game{advStats.games === 1 ? "" : "s"} with endboard scan data
              {filtersActive ? " (filtered)" : ""}.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
              <Card className="p-4 bg-card/70 border-border/60">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">High Council</div>
                <div className="text-2xl font-display tabular-nums">
                  {advStats.hcPct !== null ? `${advStats.hcPct.toFixed(1)}%` : "—"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">of scanned games</div>
              </Card>
              <Card className="p-4 bg-card/70 border-border/60">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Swordmaster</div>
                <div className="text-2xl font-display tabular-nums">
                  {advStats.smPct !== null ? `${advStats.smPct.toFixed(1)}%` : "—"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">of scanned games</div>
              </Card>
              <Card className="p-4 bg-card/70 border-border/60">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Avg Alliances</div>
                <div className="text-2xl font-display tabular-nums">
                  {advStats.avgAlliances !== null ? advStats.avgAlliances.toFixed(2) : "—"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">per game</div>
              </Card>
              <Card className="p-4 bg-card/70 border-border/60">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Avg VP/Bump</div>
                <div
                  className={`text-2xl font-display tabular-nums ${
                    advStats.vpPerBump === null
                      ? ""
                      : advStats.vpPerBump >= 0.5
                        ? "text-emerald-400"
                        : advStats.vpPerBump < 0.42
                          ? "text-red-400"
                          : ""
                  }`}
                >
                  {advStats.vpPerBump !== null ? advStats.vpPerBump.toFixed(3) : "—"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">benchmark 0.500</div>
              </Card>
              <Card className="p-4 bg-card/70 border-border/60 col-span-2 md:col-span-1">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Bump Productive</div>
                <div
                  className={`text-2xl font-display tabular-nums ${
                    advStats.productivePct === null
                      ? ""
                      : advStats.productivePct >= 55
                        ? "text-emerald-400"
                        : advStats.productivePct < 40
                          ? "text-red-400"
                          : ""
                  }`}
                >
                  {advStats.productivePct !== null ? `${advStats.productivePct.toFixed(1)}%` : "—"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">of bumps yielded value</div>
              </Card>
            </div>
            <Card className="p-0 overflow-hidden border-border/60 bg-card/70 shadow-arena">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3 text-left">Faction track</th>
                      <th className="px-4 py-3 text-right">Avg level</th>
                      <th className="px-4 py-3 text-right">Alliances</th>
                    </tr>
                  </thead>
                  <tbody>
                    {advStats.factions.map((f) => (
                      <tr key={f.key} className="border-t border-border/40 hover:bg-secondary/30">
                        <td className="px-4 py-2.5 font-medium">{f.label}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {f.avgLevel !== null ? f.avgLevel.toFixed(2) : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{f.alliances}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* Comparison to native version */}
        {showCompare && compareStats && (
          <div className="mt-8">
            <h2 className="font-display text-lg mb-1">
              Compared to {GAME_VERSIONS.find((g) => g.value === nativeVersion)?.label}
            </h2>
            <p className="text-xs text-muted-foreground mb-3">
              {GAME_VERSIONS.find((g) => g.value === version)?.label} stats vs the leader's native set. Δ shows the difference.
            </p>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <CompareCard label="Matches Played" a={stats.total} b={compareStats.total} kind="int" />
              <CompareCard label="Avg Victory Pts" a={stats.avgPts} b={compareStats.avgPts} kind="num" />
              <CompareCard label="Pick Rate" a={stats.pickRatePct} b={compareStats.pickRatePct} kind="pct" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <CompareCard label="1st (Win %)" a={stats.firstPct} b={compareStats.firstPct} kind="pct" higherIsBetter />
              <CompareCard label="2nd Place" a={stats.secondPct} b={compareStats.secondPct} kind="pct" />
              <CompareCard label="3rd Place" a={stats.thirdPct} b={compareStats.thirdPct} kind="pct" higherIsBetter={false} />
              <CompareCard label="4th Place" a={stats.fourthPct} b={compareStats.fourthPct} kind="pct" higherIsBetter={false} />
              <CompareCard label="Top 2" a={stats.top2Pct} b={compareStats.top2Pct} kind="pct" higherIsBetter className="col-span-2 md:col-span-1" />
            </div>
          </div>
        )}


        {/* Leader card image */}
        <div className="mt-8">
          <h2 className="font-display text-lg mb-3">Leader card</h2>
          <div
            className="relative aspect-[3/2] w-full max-w-2xl rounded-xl overflow-hidden border border-border/60 bg-card/60 cursor-pointer group"
            onClick={() => cardUrl && setCardOpen(true)}
          >
            {cardUrl ? (
              <SupabaseImage bucket="leader-cards" src={cardUrl} alt={`${leader.name} card`} className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform" />
            ) : (
              <div className="w-full h-full grid place-items-center text-muted-foreground">
                <ImagePlus className="size-10 opacity-50" />
                <span className="text-xs mt-2">No card image yet</span>
              </div>
            )}
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    cardInput.current?.click();
                  }}
                  className="absolute top-2 right-2 bg-black/70 hover:bg-black text-white text-xs px-3 py-1.5 rounded flex items-center gap-1"
                  disabled={uploading === "card"}
                >
                  <Upload className="size-3" />
                  {uploading === "card" ? "Uploading…" : "Upload card"}
                </button>
                <input
                  ref={cardInput}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadImage(f, "card");
                    e.target.value = "";
                  }}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Card modal */}
      {cardOpen && cardUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 grid place-items-center p-4"
          onClick={() => setCardOpen(false)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 text-white/80 hover:text-white"
            onClick={() => setCardOpen(false)}
            aria-label="Close"
          >
            <X className="size-6" />
          </button>
          <SupabaseImage
            bucket="leader-cards"
            src={cardUrl}
            alt={`${leader.name} card`}
            className="max-w-full max-h-full rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

function CompareCard({
  label,
  a,
  b,
  kind,
  higherIsBetter,
  className,
}: {
  label: string;
  a: number;
  b: number;
  kind: "pct" | "num" | "int";
  higherIsBetter?: boolean;
  className?: string;
}) {
  const fmt = (n: number) =>
    kind === "int" ? String(Math.round(n)) : kind === "pct" ? `${n.toFixed(1)}%` : n.toFixed(1);
  const diff = a - b;
  const diffStr =
    kind === "int"
      ? `${diff > 0 ? "+" : ""}${Math.round(diff)}`
      : `${diff > 0 ? "+" : ""}${diff.toFixed(1)}${kind === "pct" ? "%" : ""}`;
  const tone =
    higherIsBetter === undefined || Math.abs(diff) < 0.05
      ? "text-muted-foreground"
      : (diff > 0) === higherIsBetter
        ? "text-emerald-400"
        : "text-red-400";
  return (
    <Card className={`p-4 bg-card/70 border-border/60 ${className ?? ""}`}>
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className="text-2xl font-display tabular-nums">{fmt(a)}</div>
      <div className={`text-xs tabular-nums mt-1 ${tone}`}>
        Δ {diffStr} <span className="text-muted-foreground">(was {fmt(b)})</span>
      </div>
    </Card>
  );
}

// keep import so tree-shakers don't drop it (leader validity references LEADERS via findLeader/leader-slug)
void LEADERS;
