import { Suspense, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowDown, ArrowUp, Beaker, CalendarDays, ChevronRight,
  Crown, FlaskConical, RotateCcw, Search, ShieldCheck, Trophy,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { LeagueSeasonBanner } from "@/components/LeagueSeasonBanner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { leagueSandboxQuery, sandboxSeasonsQuery, type LeagueSandboxDataset } from "@/lib/league-sandbox-data";
import {
  defaultSandboxSettings, simulateLeagueSeason,
  type SandboxMode, type SandboxSettings, type SimulatedGame, type SimulatedPlayer,
} from "@/lib/league-sandbox";
import { useChampions, isChampion } from "@/lib/champions";
import { usePlayerTitles, colorForKey } from "@/lib/player-title";

export const Route = createFileRoute("/sandbox")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { season?: number } => ({
    season: typeof search.season === "number" && Number.isInteger(search.season) ? search.season : undefined,
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(sandboxSeasonsQuery),
  head: () => ({ meta: [
    { title: "League Elo Sandbox · Dune Stats" },
    { name: "description", content: "Experiment with VP-weighted, placement and winner-takes-all League Elo formulas without changing official ratings." },
    { property: "og:title", content: "League Elo Sandbox · Dune Stats" },
    { property: "og:description", content: "Replay a League season with experimental rating settings and compare every result with the official leaderboard." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: SandboxPage,
});

const MODE_INFO: Record<SandboxMode, { name: string; short: string; description: string; effect: string }> = {
  standard: {
    name: "Standard placement", short: "Placement only",
    description: "The current League system. Every game becomes head-to-head duels: finishing above someone scores 1, a tie scores 0.5, and finishing below scores 0. Victory Points do not matter.",
    effect: "Rewards consistent high placements. A tiebreaker win is worth exactly the same as a dominant win.",
  },
  vp: {
    name: "VP-weighted margin", short: "Placement + score",
    description: "Placement duels start at 0.75 for a win, 0.50 for a tie and 0.25 for a loss. The VP gap then adjusts each duel, within your cap. First place cannot lose Elo.",
    effect: "Rewards decisive wins and softens narrow defeats. Close low placements hurt less than heavy defeats.",
  },
  winner: {
    name: "Winner-Takes-All", short: "First or nothing",
    description: "Only first place has a winning target. The winner takes Elo from the other seats; second, third and fourth are otherwise treated equally. Shared wins split the target.",
    effect: "Measures raw winning ability and removes the usual reward for playing safely for second place.",
  },
};

function SandboxPage() {
  const { data: seasons } = useSuspenseQuery(sandboxSeasonsQuery);
  const search = Route.useSearch();
  const initial = search.season != null && seasons.includes(search.season) ? search.season : seasons[0];
  const [season, setSeason] = useState<number | null>(initial ?? null);

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="container mx-auto px-4 py-8 sm:py-10">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-teal">
              <FlaskConical className="size-4" /> Experimental ratings lab
            </div>
            <h1 className="font-display text-3xl sm:text-4xl">League Elo Sandbox</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
              Replay the season with a different formula and compare it with the official League. Experiments run on your device.
            </p>
          </div>
          {seasons.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Season
              <select value={season ?? ""} onChange={(event) => setSeason(Number(event.target.value))} className="rounded-md border border-border bg-input px-3 py-2 text-foreground">
                {seasons.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          )}
        </div>

        <div className="mt-6 flex items-start gap-3 rounded-lg border border-teal/40 bg-teal/10 p-4 text-sm">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-teal" />
          <div><strong className="text-teal">Official ratings are never changed.</strong><span className="text-muted-foreground"> Nothing here is saved to the League leaderboard or your profile.</span></div>
        </div>

        {season == null ? (
          <Card className="mt-6 p-8 text-center text-muted-foreground">No rated League season is available yet.</Card>
        ) : (
          <Suspense fallback={<Card className="mt-6 p-10 text-center text-muted-foreground">Loading the season history…</Card>}>
            <SandboxSeason key={season} season={season} />
          </Suspense>
        )}
      </main>
    </div>
  );
}

function SandboxSeason({ season }: { season: number }) {
  const { data } = useSuspenseQuery(leagueSandboxQuery(season));
  const [settings, setSettings] = useState<SandboxSettings>(() => defaultSandboxSettings("vp"));
  const [tab, setTab] = useState("leaderboard");
  const simulation = useMemo(() => simulateLeagueSeason(data.games, settings), [data.games, settings]);
  const official = useMemo(() => buildOfficialComparison(data), [data]);
  const info = MODE_INFO[settings.mode];

  return (
    <>
      <LeagueSeasonBanner seasonId={season} className="mt-6" />
      <Card className="mt-4 overflow-hidden border-border/60 bg-card/70 shadow-arena">
        <div className="border-b border-border/60 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-xl">Simulation settings</h2>
              <p className="mt-1 text-xs text-muted-foreground">{data.games.length} games · {official.rows.length} officially rated players · Starts at 1000 Elo</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setSettings(defaultSandboxSettings(settings.mode))}>
              <RotateCcw className="size-4" /> Reset {info.name}
            </Button>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            {(Object.keys(MODE_INFO) as SandboxMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSettings(defaultSandboxSettings(mode))}
                aria-pressed={settings.mode === mode}
                className={`rounded-lg border p-3 text-left transition-colors ${settings.mode === mode ? "border-sand bg-sand/15" : "border-border/60 bg-background/30 hover:bg-secondary/40"}`}
              >
                <span className={`block text-sm font-semibold ${settings.mode === mode ? "text-sand" : ""}`}>{MODE_INFO[mode].name}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{MODE_INFO[mode].short}</span>
              </button>
            ))}
          </div>
          <div className="mt-4 rounded-md border border-border/50 bg-background/30 p-3 text-sm">
            <p>{info.description}</p>
            <p className="mt-1 text-xs text-muted-foreground"><strong className="text-foreground">Who it favors:</strong> {info.effect}</p>
          </div>
        </div>

        <div className="grid gap-x-8 gap-y-6 p-4 sm:p-5 lg:grid-cols-2">
          <SettingSlider label="K-factor" value={settings.k} display={settings.k.toFixed(0)} min={16} max={64} step={1}
            description="How quickly ratings move. Higher values react more strongly to recent games."
            onChange={(k) => setSettings((current) => ({ ...current, k }))} />
          {settings.mode === "standard" && (
            <SettingSlider label="Rating scale" value={settings.scale} display={settings.scale.toFixed(0)} min={200} max={800} step={25}
              description="How strongly rating differences affect expectations. Lower values make upsets and favorite results swing harder."
              onChange={(scale) => setSettings((current) => ({ ...current, scale }))} />
          )}
          {settings.mode === "vp" && <>
            <SettingSlider label="VP sensitivity" value={settings.vpSensitivity} display={settings.vpSensitivity.toFixed(2)} min={0.02} max={0.25} step={0.01}
              description="The duel adjustment per Victory Point of difference. At 0.12, a 2 VP gap is worth 0.24 before the cap."
              onChange={(vpSensitivity) => setSettings((current) => ({ ...current, vpSensitivity }))} />
            <SettingSlider label="VP margin cap" value={settings.vpCap} display={`±${settings.vpCap.toFixed(2)}`} min={0.1} max={0.5} step={0.05}
              description="The largest bonus or penalty from score margin, stopping one runaway game from dominating a rating."
              onChange={(vpCap) => setSettings((current) => ({ ...current, vpCap }))} />
          </>}
          {settings.mode === "winner" && <>
            <SettingSlider label="Second-place cushion" value={settings.winnerCushion} display={`${Math.round(settings.winnerCushion * 100)}%`} min={0} max={0.5} step={0.05}
              description="Returns this share of second place's loss from the winner. At 0%, second loses like third and fourth."
              onChange={(winnerCushion) => setSettings((current) => ({ ...current, winnerCushion }))} />
            <div>
              <span className="text-sm font-medium">Loss distribution</span>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button type="button" variant={settings.winnerLoss === "rated" ? "default" : "outline"} size="sm" onClick={() => setSettings((current) => ({ ...current, winnerLoss: "rated" }))}>Rating-weighted</Button>
                <Button type="button" variant={settings.winnerLoss === "equal" ? "default" : "outline"} size="sm" onClick={() => setSettings((current) => ({ ...current, winnerLoss: "equal" }))}>Equal loss</Button>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Rating-weighted makes higher-rated losers pay more. Equal loss splits the winner's gain evenly across the other seats.</p>
            </div>
          </>}
        </div>
      </Card>

      {data.skippedGames > 0 && <p className="mt-3 text-xs text-muted-foreground">{data.skippedGames} game{data.skippedGames === 1 ? " was" : "s were"} left out because its result names could not be matched safely to its League rating rows.</p>}

      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="h-auto border border-border/60 bg-card/60">
            <TabsTrigger value="leaderboard" className="data-[state=active]:bg-sand data-[state=active]:text-sand-foreground"><Trophy className="size-4" /> Leaderboard</TabsTrigger>
            <TabsTrigger value="matches" className="data-[state=active]:bg-sand data-[state=active]:text-sand-foreground"><CalendarDays className="size-4" /> Recent matches</TabsTrigger>
          </TabsList>
          <span className="text-xs text-muted-foreground">Switch tabs without rerunning the simulation</span>
        </div>
        <TabsContent value="leaderboard" className="mt-4">
          <SandboxLeaderboard simulation={simulation.leaderboard} official={official} names={data.names} />
        </TabsContent>
        <TabsContent value="matches" className="mt-4">
          <SandboxMatches games={[...simulation.games].reverse()} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function SettingSlider({ label, value, display, min, max, step, description, onChange }: {
  label: string; value: number; display: string; min: number; max: number; step: number; description: string; onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm font-medium">{label}</label>
        <output className="rounded bg-secondary/60 px-2 py-0.5 font-mono text-sm text-sand">{display}</output>
      </div>
      <Slider aria-label={label} className="mt-4" value={[value]} min={min} max={max} step={step} onValueChange={([next]) => onChange(next)} />
      <div className="mt-2 flex justify-between text-[10px] text-muted-foreground"><span>{min}</span><span>{max}</span></div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

type OfficialComparison = ReturnType<typeof buildOfficialComparison>;
function buildOfficialComparison(data: LeagueSandboxDataset) {
  const sorted = [...data.official].sort((a, b) => b.elo - a.elo || a.playerKey.localeCompare(b.playerKey));
  const byKey = new Map(sorted.map((row, index) => [row.playerKey, { ...row, rank: index + 1 }]));
  return { rows: sorted, byKey };
}

function SandboxLeaderboard({ simulation, official, names }: { simulation: SimulatedPlayer[]; official: OfficialComparison; names: Record<string, string> }) {
  const [query, setQuery] = useState("");
  const [minGames, setMinGames] = useState(1);
  const champions = useChampions();
  const titles = usePlayerTitles();
  const rows = simulation.filter((row) => row.games >= minGames && (!query.trim() || (names[row.playerKey] ?? row.playerKey).toLowerCase().includes(query.trim().toLowerCase())));

  return (
    <Card className="overflow-hidden border-border/60 bg-card/70 shadow-arena">
      <div className="flex flex-col gap-3 border-b border-border/60 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search player…" className="w-full pl-8 sm:w-64" />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">Min games
          <select value={minGames} onChange={(event) => setMinGames(Number(event.target.value))} className="rounded border border-border bg-input px-2 py-1.5 text-foreground">
            {[1, 3, 5, 10, 20].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[850px] text-sm">
          <thead><tr className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-3 text-left">Sim. rank</th><th className="px-4 py-3 text-left">Player</th>
            <th className="px-4 py-3 text-right">Simulated Elo</th><th className="px-4 py-3 text-right">Elo difference</th>
            <th className="px-4 py-3 text-right">Official</th><th className="px-4 py-3 text-right">Games</th>
            <th className="px-4 py-3 text-right">Wins</th><th className="px-4 py-3 text-right">Top 2</th><th className="px-4 py-3 text-right">Win %</th>
          </tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">No simulated players match these filters.</td></tr> : rows.map((row) => {
              const real = official.byKey.get(row.playerKey);
              const eloDifference = row.elo - (real?.elo ?? 1000);
              const rankDifference = real ? real.rank - row.rank : 0;
              return (
                <tr key={row.playerKey} className="border-t border-border/40 hover:bg-secondary/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex size-8 items-center justify-center rounded font-bold text-xs ${row.rank === 1 ? "bg-sand text-sand-foreground" : row.rank === 2 ? "bg-teal/80 text-background" : row.rank === 3 ? "bg-coral/90 text-background" : "bg-muted"}`}>{row.rank}</span>
                      <RankDifference value={rankDifference} isNew={!real} />
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-2">
                      <Link to="/players/$key" params={{ key: row.playerKey }} className="hover:underline" style={{ color: colorForKey(titles, row.playerKey) }}>
                        <span className="inline-flex items-center gap-1">{isChampion(champions, row.playerKey) && <Crown className="size-3.5 text-sand" />}{names[row.playerKey] ?? row.playerKey}</span>
                      </Link>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-display text-lg text-sand tabular-nums">{row.elo.toFixed(1)}</td>
                  <td className={`px-4 py-3 text-right font-medium tabular-nums ${differenceColor(eloDifference)}`}>{signed(eloDifference)}</td>
                  <td className="px-4 py-3 text-right tabular-nums"><span>{real ? real.elo.toFixed(1) : "1000.0"}</span><span className="block text-xs text-muted-foreground">Official #{real?.rank ?? "—"}</span></td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.games}</td><td className="px-4 py-3 text-right tabular-nums">{row.wins}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.games ? Math.round(row.top2 / row.games * 100) : 0}%</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.games ? Math.round(row.wins / row.games * 100) : 0}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-border/60 px-4 py-3 text-xs text-muted-foreground">Simulated ranks stay global when you filter. Rank and Elo differences always compare against the current official season leaderboard.</p>
    </Card>
  );
}

function RankDifference({ value, isNew }: { value: number; isNew: boolean }) {
  if (isNew) return <Badge variant="outline" className="border-teal/40 text-teal">NEW</Badge>;
  if (value === 0) return <span className="text-xs text-muted-foreground">=</span>;
  const Icon = value > 0 ? ArrowUp : ArrowDown;
  return <span className={`inline-flex items-center text-xs font-semibold ${value > 0 ? "text-teal" : "text-coral"}`}><Icon className="size-3" />{Math.abs(value)}</span>;
}

function SandboxMatches({ games }: { games: SimulatedGame[] }) {
  const [visible, setVisible] = useState(20);
  return (
    <div className="space-y-4">
      {games.length === 0 ? <Card className="p-8 text-center text-muted-foreground">No simulated games are available.</Card> : games.slice(0, visible).map((game) => (
        <Card key={game.gameId} className="overflow-hidden border-border/60 bg-card/70">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/60 bg-secondary/20 px-4 py-3">
            <Beaker className="size-4 text-teal" />
            <Link to="/match/$matchId" params={{ matchId: game.matchId ?? game.gameId }} className="font-display text-sm text-sand hover:underline">{game.matchId ?? game.gameId}</Link>
            {game.lobbyId != null && <Link to="/lfg/$id" params={{ id: String(game.lobbyId) }} className="text-xs text-muted-foreground hover:text-foreground">LFG #{game.lobbyId}</Link>}
            <span className="ml-auto text-xs text-muted-foreground">{new Date(game.playedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
          </div>
          <div className="grid md:grid-cols-2">
            {[...game.results].sort((a, b) => a.placement - b.placement).map((player, index) => {
              const difference = player.simulatedDelta - player.officialDelta;
              return (
                <div key={player.playerKey} className={`p-4 ${index % 2 === 0 ? "md:border-r" : ""} ${index > 1 ? "border-t" : index === 1 ? "border-t md:border-t-0" : ""} border-border/40`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2"><span className="w-6 text-xs text-muted-foreground">#{player.placement}</span><Link to="/players/$key" params={{ key: player.playerKey }} className="truncate font-medium hover:underline">{player.playerName}</Link></div>
                      <p className="ml-8 truncate text-xs text-muted-foreground">{player.leaderName ?? "Unknown leader"} · {player.points} VP</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className={`font-display text-lg tabular-nums ${player.simulatedDelta >= 0 ? "text-teal" : "text-coral"}`}>{signed(player.simulatedDelta)}</div>
                      <div className="text-xs text-muted-foreground">Official {signed(player.officialDelta)}</div>
                    </div>
                  </div>
                  <div className="ml-8 mt-2 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Difference from official</span>
                    <span className={`font-medium tabular-nums ${differenceColor(difference)}`}>{signed(difference)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ))}
      {visible < games.length && <div className="text-center"><Button variant="outline" onClick={() => setVisible((value) => value + 20)}>Show 20 more <ChevronRight className="size-4" /></Button></div>}
    </div>
  );
}

const signed = (value: number) => `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}`;
const differenceColor = (value: number) => Math.abs(value) < 0.05 ? "text-muted-foreground" : value > 0 ? "text-teal" : "text-coral";
