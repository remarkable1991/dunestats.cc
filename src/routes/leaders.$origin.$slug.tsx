import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { GAME_VERSIONS, type GameVersion } from "@/lib/game-version";
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
  games: { id: string; game_version: GameVersion } | null;
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
      let from = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from("game_results")
          .select("placement, points, leader_name, games!inner(id, game_version)")
          .range(from, from + PAGE - 1);
        if (error || !data || data.length === 0) break;
        for (const r of data as unknown as Row[]) {
          if (!r.leader_name) continue;
          if (aliases.includes(normalize(r.leader_name))) out.push(r);
        }
        if (data.length < PAGE) break;
        from += PAGE;
      }
      setRows(out);
      setLoading(false);
    })();
  }, [leader?.name]);

  // load images (signed URLs)
  const loadImages = async () => {
    if (!leader) return;
    const [p, c] = await Promise.all([
      supabase.storage.from("leader-portraits").createSignedUrl(`${leader.slug}.jpg`, 3600),
      supabase.storage.from("leader-cards").createSignedUrl(`${leader.slug}.jpg`, 3600),
    ]);
    setPortraitUrl(p.data?.signedUrl ?? null);
    setCardUrl(c.data?.signedUrl ?? null);
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

  const computeStats = (v: GameVersion) => {
    const f = v === "overall" ? rows : rows.filter((r) => r.games?.game_version === v);
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

  const stats = useMemo(() => computeStats(version), [rows, version, seatsByVersion]);
  const nativeVersion = ORIGIN_TO_VERSION[leader?.origin ?? "base"];
  const showCompare = leader && version !== "overall" && version !== nativeVersion;
  const compareStats = useMemo(
    () => (showCompare ? computeStats(nativeVersion) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, version, seatsByVersion, showCompare, nativeVersion],
  );

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
              <img src={portraitUrl} alt={`${leader.name} portrait`} className="w-full h-full object-cover" />
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

        {/* Summary metrics */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Card className="p-4 bg-card/70 border-border/60">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Matches Played</div>
            <div className="text-2xl font-display">{loading ? "…" : stats.total}</div>
          </Card>
          <Card className="p-4 bg-card/70 border-border/60">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Avg Victory Pts</div>
            <div className="text-2xl font-display">{loading ? "…" : stats.avgPts.toFixed(1)}</div>
          </Card>
          <Card className="p-4 bg-card/70 border-border/60">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Pick Rate</div>
            <div className="text-2xl font-display">{loading || totalSeats === null ? "…" : `${stats.pickRatePct.toFixed(1)}%`}</div>
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
          </Card>
          <Card className="p-4 bg-card/70 border-border/60">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">2nd Place</div>
            <div className={`text-2xl font-display tabular-nums ${secondTone(stats.firstPct, stats.secondPct)}`}>
              {loading ? "…" : `${stats.secondPct.toFixed(1)}%`}
            </div>
            <div className="text-xs text-muted-foreground mt-1">{stats.seconds} results</div>
          </Card>
          <Card className="p-4 bg-card/70 border-border/60">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">3rd Place</div>
            <div className={`text-2xl font-display tabular-nums ${bottomTone(stats.thirdPct, stats.fourthPct)}`}>
              {loading ? "…" : `${stats.thirdPct.toFixed(1)}%`}
            </div>
            <div className="text-xs text-muted-foreground mt-1">{stats.thirds} results</div>
          </Card>
          <Card className="p-4 bg-card/70 border-border/60">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">4th Place</div>
            <div className={`text-2xl font-display tabular-nums ${bottomTone(stats.thirdPct, stats.fourthPct)}`}>
              {loading ? "…" : `${stats.fourthPct.toFixed(1)}%`}
            </div>
            <div className="text-xs text-muted-foreground mt-1">{stats.fourths} results</div>
          </Card>
          <Card className="p-4 bg-card/70 border-border/60 col-span-2 md:col-span-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Top 2</div>
            <div className={`text-2xl font-display tabular-nums ${top2Tone(stats.firstPct, stats.secondPct)}`}>
              {loading ? "…" : `${stats.top2Pct.toFixed(1)}%`}
            </div>
            <div className="text-xs text-muted-foreground mt-1">1st + 2nd combined</div>
          </Card>
        </div>

        <p className="text-xs text-muted-foreground mt-4">
          Based on {stats.total} recorded seats
          {version !== "overall" ? ` in ${GAME_VERSIONS.find((g) => g.value === version)?.label}` : ""}.
        </p>

        {/* Leader card image */}
        <div className="mt-8">
          <h2 className="font-display text-lg mb-3">Leader card</h2>
          <div
            className="relative aspect-[3/2] w-full max-w-2xl rounded-xl overflow-hidden border border-border/60 bg-card/60 cursor-pointer group"
            onClick={() => cardUrl && setCardOpen(true)}
          >
            {cardUrl ? (
              <img src={cardUrl} alt={`${leader.name} card`} className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform" />
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
          <img
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

// keep import so tree-shakers don't drop it (leader validity references LEADERS via findLeader/leader-slug)
void LEADERS;
