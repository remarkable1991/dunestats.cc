import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CalendarDays,
  CalendarClock,
  CheckCircle2,
  Clipboard,
  Download,
  Gauge,
  Loader2,
  Play,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
  Trophy,
  Upload,
  Users,
} from "lucide-react";
import { HeatmapBody, type HeatmapPlayer } from "@/components/AvailabilityHeatmap";
import { Navbar } from "@/components/Navbar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRoles } from "@/hooks/use-roles";
import { supabase } from "@/integrations/supabase/client";
import { fetchTournaments, type TournamentConfig } from "@/lib/tournaments";
import {
  STRATEGIES,
  availabilityOf,
  discordCsv,
  duplicateGroups,
  matchupsCsv,
  publishRows,
  runMatchmaker,
  type MatchmakerCandidate,
  type MatchmakerProgress,
  type MatchmakerRegistration,
  type MatchmakerSettings,
} from "@/lib/tournament-matchmaker";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/matchmaking")({
  head: () => ({
    meta: [
      { title: "Live Tournament Matchmaker — Strategy Arena" },
      { name: "description", content: "Build and review balanced live tournament tables from player availability." },
      { property: "og:title", content: "Live Tournament Matchmaker — Strategy Arena" },
      { property: "og:description", content: "Build and review balanced live tournament tables from player availability." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MatchmakingPage,
});

type Audit = {
  checked: MatchmakerRegistration[];
  missing: MatchmakerRegistration[];
  active: MatchmakerRegistration[];
  standby: MatchmakerRegistration[];
  duplicates: MatchmakerRegistration[][];
};

function dateTimeValue(date: Date, end = false) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  const value = local.toISOString().slice(0, 16);
  return end ? `${value.slice(0, 11)}23:59` : value;
}

function settingsFor(tournament: TournamentConfig): MatchmakerSettings {
  return {
    startDate: dateTimeValue(new Date(`${tournament.start_date}T00:00:00`)),
    cutoffDate: dateTimeValue(new Date(`${tournament.end_date}T00:00:00`), true),
    targetSlots: 3,
    maxSeeds: 120,
    stepsPerSeed: 500,
    checkpointStep: 200,
    patience: 20,
    initialTemperature: 120,
    coolingRate: 0.998,
    startStage: 1,
    quickProbeSeeds: 15,
  };
}

function auditRows(rows: MatchmakerRegistration[]): Audit {
  const checked = rows.filter((row) => row.has_checked_in === true).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const activeCount = Math.floor(checked.length / 4) * 4;
  return {
    checked,
    missing: rows.filter((row) => row.has_checked_in !== true),
    active: checked.slice(0, activeCount),
    standby: checked.slice(activeCount),
    duplicates: duplicateGroups(rows),
  };
}

function downloadText(filename: string, text: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function MatchmakingPage() {
  const roles = useRoles();
  const canManage = roles.isAdmin || roles.isTournamentHost;
  const [loading, setLoading] = useState(true);
  const [tournaments, setTournaments] = useState<TournamentConfig[]>([]);
  const [selectedNum, setSelectedNum] = useState<number | null>(null);
  const [rows, setRows] = useState<MatchmakerRegistration[]>([]);
  const [settings, setSettings] = useState<MatchmakerSettings | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<MatchmakerProgress | null>(null);
  const [best, setBest] = useState<MatchmakerCandidate | null>(null);
  const [selectedRound, setSelectedRound] = useState("1");
  const [pendingCheckIn, setPendingCheckIn] = useState<{ row: MatchmakerRegistration; checked: boolean } | null>(null);
  const [checkInBusy, setCheckInBusy] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [existingCount, setExistingCount] = useState<number | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    if (!publishOpen || selectedNum == null) return;
    setExistingCount(null);
    void supabase.from("tournament_matches").select("id", { count: "exact", head: true }).eq("tournament_num", selectedNum).in("round_type", ["Game_1", "Game_2", "Game_3"]).then(({ count }) => setExistingCount(count ?? 0));
  }, [publishOpen, selectedNum]);

  const publish = async () => {
    if (!best || selectedNum == null) return;
    setPublishing(true);
    try {
      if (existingCount) {
        const { error } = await supabase.from("tournament_matches").delete().eq("tournament_num", selectedNum).in("round_type", ["Game_1", "Game_2", "Game_3"]).is("placement", null);
        if (error) throw error;
      }
      const { error } = await supabase.from("tournament_matches").insert(publishRows(best, selectedNum, audit.active));
      if (error) throw error;
      toast.success(`Published ${best.tables.length} tables to Tournament ${selectedNum}`);
      setPublishOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Publishing failed");
    } finally {
      setPublishing(false);
    }
  };

  useEffect(() => {
    if (roles.loading) return;
    if (!canManage) { setLoading(false); return; }
    void fetchTournaments().then((items) => {
      setTournaments(items);
      const initial = items.find((item) => item.registration_open) ?? items[0] ?? null;
      if (initial) {
        setSelectedNum(initial.tournament_num);
        setSettings(settingsFor(initial));
      }
      setLoading(false);
    });
  }, [canManage, roles.loading]);

  useEffect(() => {
    if (!canManage || selectedNum == null) return;
    setRows([]);
    setBest(null);
    setProgress(null);
    void supabase
      .from("tournament_registrations")
      .select("id, user_id, direwolf_name, discord_username, availability, created_at, has_checked_in, check_in_method, checked_in_at")
      .eq("tournament_num", selectedNum)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        setRows((data ?? []) as MatchmakerRegistration[]);
      });
  }, [canManage, selectedNum]);

  const tournament = tournaments.find((item) => item.tournament_num === selectedNum) ?? null;
  const audit = useMemo(() => auditRows(rows), [rows]);
  const completion = progress ? ((progress.strategyIndex * progress.maxSeeds + progress.seed) / (STRATEGIES.length * progress.maxSeeds)) * 100 : 0;

  const chooseTournament = (value: string) => {
    const num = Number(value);
    const next = tournaments.find((item) => item.tournament_num === num);
    setSelectedNum(num);
    if (next) setSettings(settingsFor(next));
  };

  const copyReminders = async () => {
    const tags = audit.missing.map((row) => row.discord_username?.trim() ? `@${row.discord_username.trim()}` : row.direwolf_name).join(" ");
    const text = audit.missing.length
      ? `Friendly reminder to check in for Tournament ${selectedNum}:\n${tags}\n\nMissing count: ${audit.missing.length} / ${rows.length}`
      : `All registered players have checked in for Tournament ${selectedNum}.`;
    await navigator.clipboard.writeText(text);
    toast.success("Discord reminder copied");
  };

  const confirmCheckInChange = async () => {
    if (!pendingCheckIn) return;
    setCheckInBusy(true);
    const checkedAt = pendingCheckIn.checked ? new Date().toISOString() : null;
    const { error } = await supabase
      .from("tournament_registrations")
      .update({
        has_checked_in: pendingCheckIn.checked,
        check_in_method: pendingCheckIn.checked ? "admin" : null,
        checked_in_at: checkedAt,
      })
      .eq("id", pendingCheckIn.row.id);
    if (error) {
      toast.error(error.message);
    } else {
      setRows((current) => current.map((row) => row.id === pendingCheckIn.row.id ? {
        ...row,
        has_checked_in: pendingCheckIn.checked,
        check_in_method: pendingCheckIn.checked ? "admin" : null,
        checked_in_at: checkedAt,
      } : row));
      setBest(null);
      setProgress(null);
      toast.success(`${pendingCheckIn.row.direwolf_name} marked ${pendingCheckIn.checked ? "checked in" : "not checked in"}`);
      setPendingCheckIn(null);
    }
    setCheckInBusy(false);
  };

  const run = async () => {
    if (!settings || !tournament) return;
    if (audit.duplicates.length) { toast.error("Resolve duplicate registrations before matchmaking."); return; }
    if (audit.active.length < 16) { toast.error("At least 16 checked-in players are required."); return; }
    cancelled.current = false;
    setRunning(true);
    setProgress(null);
    setBest(null);
    try {
      const result = await runMatchmaker(audit.active, settings, (next, candidate) => {
        setProgress(next);
        if (candidate) setBest(candidate);
      }, () => cancelled.current);
      setBest(result);
      if (!cancelled.current) {
        if (result?.brokenTables === 0) toast.success("A conflict-free schedule is ready to review.");
        else toast.warning("Search finished with unresolved tables. Review the best draft below.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Matchmaking failed");
    } finally {
      setRunning(false);
    }
  };

  if (loading || roles.loading) return <PageShell><div className="flex justify-center py-16"><Loader2 className="size-7 animate-spin text-sand" /></div></PageShell>;
  if (!canManage) return (
    <PageShell>
      <Card className="border-sand/40 p-6"><h1 className="font-display text-2xl">Tournament hosts only</h1><p className="mt-2 text-sm text-muted-foreground">You need the admin or tournament host role to use the matchmaker.</p></Card>
    </PageShell>
  );

  return (
    <PageShell>
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase text-sand"><Sparkles className="size-4" /> Live tournament operations</div>
          <h1 className="font-display text-3xl sm:text-4xl">Matchmaker Studio</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Audit the field, test balanced schedules, compare the strongest draft, and export files for the Discord bot.</p>
        </div>
        <Button asChild variant="ghost" size="sm"><Link to="/admin/tournaments"><ArrowLeft className="size-4" /> Manage tournaments</Link></Button>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Card className="border-sand/40 p-5">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <div><Label>Tournament</Label><Select value={selectedNum == null ? undefined : String(selectedNum)} onValueChange={chooseTournament}><SelectTrigger className="mt-1"><SelectValue placeholder="Choose a tournament" /></SelectTrigger><SelectContent>{tournaments.map((item) => <SelectItem key={item.tournament_num} value={String(item.tournament_num)}>#{item.tournament_num} — {item.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="flex items-center gap-2 rounded-md border border-teal/30 bg-teal/10 px-3 py-2 text-xs text-teal"><ShieldCheck className="size-4" /> Read-only draft</div>
            </div>
          </Card>

          <AuditPanel audit={audit} total={rows.length} tournamentNum={selectedNum} onCopy={() => void copyReminders()} />

          <PlayerAvailabilityPanel rows={rows} onCheckInChange={(row, checked) => setPendingCheckIn({ row, checked })} />

          {settings && <SettingsPanel settings={settings} disabled={running} onChange={setSettings} onReset={() => tournament && setSettings(settingsFor(tournament))} />}

          <Card className="overflow-hidden border-sand/40">
            <div className="border-b border-border/60 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="font-display text-xl">Search console</h2><p className="text-xs text-muted-foreground">Six fallback levels automatically relax only when stricter rules stall.</p><div className="mt-2 flex flex-wrap items-center gap-1 text-xs"><span className="mr-1 text-muted-foreground">Start at:</span>{STRATEGIES.map((_, i) => <Button key={i} size="sm" variant={settings?.startStage === i + 1 ? "default" : "outline"} className="h-7 px-2" disabled={running || !settings} onClick={() => settings && setSettings({ ...settings, startStage: i + 1 })}>{i + 1}</Button>)}<Button size="sm" variant="ghost" className="h-7 px-2 text-sand" disabled={running || !settings} onClick={() => settings && setSettings({ ...settings, startStage: 5 })}><Sparkles className="size-3" /> Jump to 3/4 stages</Button></div></div>
                {running ? <Button variant="destructive" onClick={() => { cancelled.current = true; }}><Square className="size-4" /> Stop search</Button> : <Button className="bg-sand text-background hover:bg-sand/90" onClick={() => void run()} disabled={!settings || audit.active.length < 16 || audit.duplicates.length > 0}><Play className="size-4" /> Run matchmaker</Button>}
              </div>
              {(running || progress) && <div className="mt-5 space-y-2"><Progress value={completion} /><div className="flex justify-between text-xs text-muted-foreground"><span>{progress ? `Level ${progress.strategyIndex + 1}: ${STRATEGIES[progress.strategyIndex].name} · Seed ${progress.seed}/${progress.maxSeeds}` : "Preparing player availability…"}</span><span>{Math.round(completion)}%</span></div></div>}
            </div>
            <div className="grid grid-cols-2 divide-x divide-y divide-border/50 sm:grid-cols-3 lg:grid-cols-6">
              {STRATEGIES.map((strategy, index) => {
                const active = progress?.strategyIndex === index;
                const skipped = !progress && settings != null && index + 1 < settings.startStage;
                const passed = progress != null && progress.strategyIndex > index;
                return <div key={strategy.name} className={`min-h-24 p-3 ${active ? "bg-sand/10" : ""} ${skipped ? "opacity-40" : ""}`}><div className={`mb-2 flex size-6 items-center justify-center rounded-full border text-xs ${active ? "border-sand bg-sand text-background" : passed ? "border-teal text-teal" : "border-border text-muted-foreground"}`}>{passed ? <CheckCircle2 className="size-4" /> : index + 1}</div><div className="text-xs font-semibold">{strategy.name}</div><div className="mt-1 hidden text-[10px] leading-4 text-muted-foreground sm:block">{strategy.detail}</div></div>;
              })}
            </div>
            {progress && <div className="grid grid-cols-3 gap-px border-t border-border/60 bg-border/60"><Metric label="Current score" value={Math.round(progress.score).toLocaleString()} /><Metric label="Best score" value={Math.round(progress.bestScore).toLocaleString()} /><Metric label="Broken tables" value={String(progress.bestBrokenTables)} danger={progress.bestBrokenTables > 0} /></div>}
          </Card>

          {best && <Results candidate={best} rows={audit.active} tournamentNum={selectedNum ?? 0} selectedRound={selectedRound} onRoundChange={setSelectedRound} onPublish={() => setPublishOpen(true)} canPublish={!running} />}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <Card className="border-sand/40 p-4"><div className="flex items-center gap-2"><Trophy className="size-5 text-sand" /><h2 className="font-display text-lg">Best version</h2></div>{best ? <div className="mt-4 space-y-3"><div className="flex items-end justify-between"><div><div className="text-3xl font-semibold tabular-nums">{Math.round(best.score).toLocaleString()}</div><div className="text-xs text-muted-foreground">quality score</div></div><div className={`rounded-md border px-2 py-1 text-xs ${best.brokenTables ? "border-destructive/50 text-destructive" : "border-teal/50 bg-teal/10 text-teal"}`}>{best.brokenTables ? `${best.brokenTables} unresolved` : "All tables clean"}</div></div><div className="border-t border-border/60 pt-3 text-sm"><div className="font-medium text-sand">Level {best.strategyIndex + 1} · {best.strategy.name}</div><div className="mt-1 text-xs text-muted-foreground">Seed {best.seed} · {best.strategy.detail}</div></div></div> : <p className="mt-3 text-sm text-muted-foreground">The strongest schedule appears here while the search is running.</p>}</Card>
          <Card className="border-border/60 p-4"><div className="flex items-center gap-2"><Gauge className="size-5 text-teal" /><h2 className="font-display text-lg">How it chooses</h2></div><ul className="mt-3 space-y-2 text-xs text-muted-foreground"><li>• Three rounds without repeat opponents</li><li>• Four-player tables only</li><li>• Earlier unanimous time windows score higher</li><li>• Shared availability and weak links affect quality</li><li>• Later levels allow controlled 3/4 backups</li></ul></Card>
        </aside>
      </div>

      <AlertDialog open={pendingCheckIn != null} onOpenChange={(open) => { if (!open && !checkInBusy) setPendingCheckIn(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingCheckIn?.checked ? "Check player in?" : "Remove player check-in?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingCheckIn?.checked
                ? `${pendingCheckIn.row.direwolf_name} will join the active field, subject to the four-player cutoff.`
                : `${pendingCheckIn?.row.direwolf_name ?? "This player"} will be removed from the active field and any current browser draft will be cleared.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={checkInBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={checkInBusy} onClick={(event) => { event.preventDefault(); void confirmCheckInChange(); }}>
              {checkInBusy && <Loader2 className="size-4 animate-spin" />}
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={publishOpen} onOpenChange={(open) => { if (!publishing) setPublishOpen(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish tables to Tournament {selectedNum}?</AlertDialogTitle>
            <AlertDialogDescription>
              {best?.tables.length ?? 0} tables for Games 1–3 will appear on the live tournament page.
              {existingCount == null ? " Checking existing tables…" : existingCount > 0 ? ` ${existingCount} existing Game 1–3 rows without results will be replaced; rows with results are kept.` : " No existing Game 1–3 tables found."}
              {best && best.brokenTables > 0 ? ` Warning: ${best.brokenTables} tables are unresolved.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={publishing}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={publishing || existingCount == null} onClick={(event) => { event.preventDefault(); void publish(); }}>
              {publishing && <Loader2 className="size-4 animate-spin" />}
              Publish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen"><Navbar /><main className="container mx-auto max-w-7xl space-y-6 px-4 py-6">{children}</main></div>;
}

function Metric({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <div className="bg-card p-4 text-center"><div className={`text-xl font-semibold tabular-nums ${danger ? "text-destructive" : "text-foreground"}`}>{value}</div><div className="text-[10px] uppercase text-muted-foreground">{label}</div></div>;
}

function AuditPanel({ audit, total, tournamentNum, onCopy }: { audit: Audit; total: number; tournamentNum: number | null; onCopy: () => void }) {
  return <Card className="border-border/60 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><Users className="size-5 text-teal" /><h2 className="font-display text-xl">Check-in audit</h2></div><p className="mt-1 text-xs text-muted-foreground">A fast field check for Tournament {tournamentNum ?? "—"}. No records are changed.</p></div><Button variant="outline" size="sm" onClick={onCopy} disabled={!total}><Clipboard className="size-4" /> Copy Discord reminder</Button></div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="Registered" value={String(total)} /><Metric label="Checked in" value={String(audit.checked.length)} /><Metric label="Active field" value={String(audit.active.length)} /><Metric label="Standby" value={String(audit.standby.length)} danger={audit.standby.length > 0} /></div>{audit.duplicates.length > 0 && <div className="mt-4 flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><span>{audit.duplicates.length} duplicate registration group{audit.duplicates.length === 1 ? "" : "s"} found. Matchmaking is paused until these are resolved.</span></div>}{audit.missing.length > 0 && <div className="mt-4"><div className="mb-2 text-xs font-medium text-muted-foreground">Awaiting check-in</div><div className="flex flex-wrap gap-2">{audit.missing.map((row) => <span key={row.id} className="rounded-md border border-border bg-muted/50 px-2 py-1 text-xs">{row.direwolf_name}</span>)}</div></div>}{audit.standby.length > 0 && <div className="mt-4"><div className="mb-2 text-xs font-medium text-muted-foreground">Standby · latest registrations</div><div className="flex flex-wrap gap-2">{audit.standby.map((row) => <span key={row.id} className="rounded-md border border-coral/40 bg-coral/10 px-2 py-1 text-xs text-coral">{row.direwolf_name}</span>)}</div></div>}</Card>;
}

function availabilitySummary(row: MatchmakerRegistration) {
  const values = availabilityOf(row.availability)
    .map((value) => new Date(value))
    .filter((value) => Number.isFinite(value.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  if (!values.length) return { slots: 0, hours: 0, range: "No availability" };
  const unique = new Set(values.map((value) => value.getTime()));
  const first = values[0].toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const last = values[values.length - 1].toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return { slots: unique.size, hours: unique.size / 2, range: first === last ? first : `${first} – ${last}` };
}

function PlayerAvailabilityPanel({ rows, onCheckInChange }: { rows: MatchmakerRegistration[]; onCheckInChange: (row: MatchmakerRegistration, checked: boolean) => void }) {
  const summaries = useMemo(() => new Map(rows.map((row) => [row.id, availabilitySummary(row)])), [rows]);
  return (
    <Card className="overflow-hidden border-border/60">
      <div className="border-b border-border/60 p-5">
        <div className="flex items-center gap-2"><CalendarDays className="size-5 text-sand" /><h2 className="font-display text-xl">Players &amp; availability</h2></div>
        <p className="mt-1 text-xs text-muted-foreground">Review recorded availability. Changing check-in requires confirmation and clears the current draft.</p>
      </div>
      <div className="max-h-[34rem] overflow-auto">
        <div className="min-w-[650px] divide-y divide-border/50">
          <div className="grid grid-cols-[minmax(180px,1.4fr)_minmax(150px,1fr)_90px_120px] gap-3 bg-muted/30 px-5 py-2 text-[10px] font-medium uppercase text-muted-foreground">
            <span>Player</span><span>Availability</span><span>Hours</span><span className="text-right">Checked in</span>
          </div>
          {rows.map((row) => {
            const summary = summaries.get(row.id) ?? { slots: 0, hours: 0, range: "No availability" };
            return (
              <div key={row.id} className="grid grid-cols-[minmax(180px,1.4fr)_minmax(150px,1fr)_90px_120px] items-center gap-3 px-5 py-3 text-sm">
                <div className="min-w-0"><div className="truncate font-medium">{row.direwolf_name}</div><div className="truncate text-[11px] text-muted-foreground">{row.discord_username ? `@${row.discord_username}` : "No Discord name"}</div></div>
                <div><div>{summary.range}</div><div className="text-[11px] text-muted-foreground">{summary.slots} half-hour slots</div></div>
                <span className={summary.hours ? "tabular-nums text-teal" : "text-muted-foreground"}>{summary.hours.toFixed(1)}h</span>
                <div className="flex items-center justify-end gap-2"><span className="text-xs text-muted-foreground">{row.has_checked_in ? "Yes" : "No"}</span><Switch checked={row.has_checked_in === true} onCheckedChange={(checked) => onCheckInChange(row, checked)} aria-label={`Set check-in for ${row.direwolf_name}`} /></div>
              </div>
            );
          })}
          {!rows.length && <p className="px-5 py-8 text-center text-sm text-muted-foreground">No registrations found.</p>}
        </div>
      </div>
    </Card>
  );
}

function SettingsPanel({ settings, disabled, onChange, onReset }: { settings: MatchmakerSettings; disabled: boolean; onChange: (v: MatchmakerSettings) => void; onReset: () => void }) {
  const set = <K extends keyof MatchmakerSettings>(key: K, value: MatchmakerSettings[K]) => onChange({ ...settings, [key]: value });
  const numeric = (key: keyof MatchmakerSettings, value: string) => set(key, Number(value) as never);
  return <Card className="border-border/60 p-5"><div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2"><CalendarClock className="size-5 text-coral" /><h2 className="font-display text-xl">Search controls</h2></div><p className="mt-1 text-xs text-muted-foreground">Adjust this run without changing tournament settings.</p></div><Button variant="ghost" size="icon" onClick={onReset} disabled={disabled} title="Reset controls"><RotateCcw className="size-4" /></Button></div><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Field label="Availability starts"><Input type="datetime-local" value={settings.startDate} disabled={disabled} onChange={(e) => set("startDate", e.target.value)} /></Field><Field label="Availability ends"><Input type="datetime-local" value={settings.cutoffDate} disabled={disabled} onChange={(e) => set("cutoffDate", e.target.value)} /></Field><Field label="Suggestions per table"><Input type="number" min={1} max={5} value={settings.targetSlots} disabled={disabled} onChange={(e) => numeric("targetSlots", e.target.value)} /></Field><Field label="Search seeds"><Input type="number" min={1} max={300} value={settings.maxSeeds} disabled={disabled} onChange={(e) => numeric("maxSeeds", e.target.value)} /></Field><Field label="Steps per seed"><Input type="number" min={25} max={2000} step={25} value={settings.stepsPerSeed} disabled={disabled} onChange={(e) => numeric("stepsPerSeed", e.target.value)} /></Field><Field label="Early check step"><Input type="number" min={10} max={settings.stepsPerSeed} step={10} value={settings.checkpointStep} disabled={disabled} onChange={(e) => numeric("checkpointStep", e.target.value)} /></Field><Field label="Stagnant seed limit"><Input type="number" min={1} max={100} value={settings.patience} disabled={disabled} onChange={(e) => numeric("patience", e.target.value)} /></Field><Field label="Quick probe seeds (skipped stages)"><Input type="number" min={0} max={100} value={settings.quickProbeSeeds} disabled={disabled} onChange={(e) => numeric("quickProbeSeeds", e.target.value)} /></Field><Field label="Starting temperature"><Input type="number" min={1} max={500} value={settings.initialTemperature} disabled={disabled} onChange={(e) => numeric("initialTemperature", e.target.value)} /></Field></div></Card>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1"><Label className="text-xs text-muted-foreground">{label}</Label>{children}</div>; }

function tableQuality(table: MatchmakerCandidate["tables"][number]) {
  const near = table.slots.filter((slot) => slot.type === "near").length;
  return (table.broken ? -1000 : 0) + table.slots.length * 20 - near * 15 + table.averageSharedHours;
}

function Results({ candidate, rows, tournamentNum, selectedRound, onRoundChange, onPublish, canPublish }: { candidate: MatchmakerCandidate; rows: MatchmakerRegistration[]; tournamentNum: number; selectedRound: string; onRoundChange: (v: string) => void; onPublish: () => void; canPublish: boolean }) {
  const [view, setView] = useState<"all" | "worst" | "issues">("all");
  const round = Number(selectedRound);
  const filterTables = (items: MatchmakerCandidate["tables"]) => {
    if (view === "worst") return [...items].sort((a, b) => tableQuality(a) - tableQuality(b));
    if (view === "issues") return items.filter((t) => t.broken || t.slots.some((s) => s.type === "near") || t.slots.length < 3).sort((a, b) => tableQuality(a) - tableQuality(b));
    return items;
  };
  const roundTables = view === "all" ? candidate.tables.filter((t) => t.round === round) : filterTables(candidate.tables);
  const tables = view === "all" ? roundTables : roundTables;
  return <section className="border-y border-sand/50 py-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-teal"><CheckCircle2 className="size-5" /><span className="text-xs font-semibold uppercase">Review-ready browser draft</span></div><h2 className="mt-1 font-display text-2xl">Best schedule found</h2><p className="text-xs text-muted-foreground">Not published yet. Review, export, or publish to the tournament page.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => downloadText(`t${tournamentNum}_balanced_live_tournament_matchups.csv`, matchupsCsv(candidate, tournamentNum, rows))}><Download className="size-4" /> Matchups CSV</Button>{[1, 2, 3].map((r) => <Button key={r} variant="outline" size="sm" onClick={() => downloadText(`t${tournamentNum}_round_${r}_live_bot_ready.csv`, discordCsv(candidate, rows, r))}><Bot className="size-4" /> Bot G{r}</Button>)}<Button size="sm" className="bg-sand text-background hover:bg-sand/90" onClick={onPublish} disabled={!canPublish}><Upload className="size-4" /> Publish</Button></div></div>
  <div className="mt-5 flex flex-wrap items-center gap-2"><span className="text-xs text-muted-foreground">Show:</span>{([["all", "By game"], ["worst", "Worst tables first"], ["issues", "Only weak tables"]] as const).map(([key, label]) => <Button key={key} size="sm" variant={view === key ? "default" : "outline"} className="h-7" onClick={() => setView(key)}>{label}</Button>)}</div>
  {view === "all" ? <Tabs value={selectedRound} onValueChange={onRoundChange} className="mt-4"><TabsList>{[1, 2, 3].map((item) => <TabsTrigger key={item} value={String(item)}>Game {item}</TabsTrigger>)}</TabsList>{[1, 2, 3].map((item) => <TabsContent key={item} value={String(item)}><div className="space-y-4">{tables.map((table) => <TablePreview key={table.table} table={table} timeline={candidate.timeline} rows={rows} />)}</div></TabsContent>)}</Tabs> : <div className="mt-4 space-y-4">{tables.length ? tables.map((table) => <TablePreview key={`${table.round}-${table.table}`} table={table} timeline={candidate.timeline} rows={rows} />) : <p className="py-6 text-center text-sm text-muted-foreground">No weak tables — every table has three unanimous options.</p>}</div>}</section>;
}

function TablePreview({ table, timeline, rows }: { table: MatchmakerCandidate["tables"][number]; timeline: number[]; rows: MatchmakerRegistration[] }) {
  const byName = new Map(rows.map((row) => [row.direwolf_name, row]));
  const players: HeatmapPlayer[] = table.players.map((player) => ({
    player_name: player,
    discord_username: byName.get(player)?.discord_username ?? null,
    player_compatibility_score: table.playerCompatibility[player],
    player_availability: availabilityOf(byName.get(player)?.availability),
  }));
  const suggestedSlots = table.slots.map((slot, index) => ({
    label: String.fromCharCode(65 + index),
    time_text: `<t:${Math.floor(timeline[slot.index] / 1000)}:F>${slot.type === "near" ? ` · 3/4, ${slot.missing} ${slot.gap ?? 0}h away` : ""}`,
  }));
  return <div className="overflow-hidden rounded-md border border-border/70 bg-background/30"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3"><div><div className="font-display text-lg text-sand">Game {table.round} · Table {table.table}</div><div className="text-xs text-muted-foreground">Draft table mapping · seats follow the list below</div></div><div className="flex items-center gap-2 text-xs text-muted-foreground">{table.broken && <span className="rounded border border-destructive/50 px-1.5 py-0.5 text-destructive">Unresolved</span>}{table.slots.some((s) => s.type === "near") && <span className="rounded border border-coral/50 px-1.5 py-0.5 text-coral">3/4 backup</span>}{table.averageSharedHours.toFixed(1)}h shared avg</div></div><div className="grid divide-y divide-border/40 sm:grid-cols-4 sm:divide-x sm:divide-y-0">{table.players.map((player, index) => <div key={player} className="flex items-center gap-2 px-3 py-2 text-sm"><span className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-muted text-[10px] text-muted-foreground">{index + 1}</span><div className="min-w-0"><div className="truncate font-medium">{player}</div><div className="text-[10px] text-muted-foreground">{table.playerCompatibility[player].toFixed(1)}h compatibility</div></div></div>)}</div><div className="p-4"><HeatmapBody tableId={`Game ${table.round} · Table ${table.table}`} matchQuality={table.averageSharedHours} players={players} suggestedSlots={suggestedSlots} playMode="live" /></div></div>;
}