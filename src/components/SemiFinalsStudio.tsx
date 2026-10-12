import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clipboard, Download, Loader2, Play, Trophy, Upload, UserMinus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TournamentConfig } from "@/lib/tournaments";
import {
  announcement,
  botCsv,
  computeStandings,
  findRegistration,
  runSemiSearch,
  type QualifierRow,
  type SemiDraft,
  type SemiRegistration,
} from "@/lib/tournament-semifinals";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const dayValue = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
function ago(iso: string) {
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "1d ago" : `${d}d ago`;
}

export function SemiFinalsStudio({ tournament }: { tournament: TournamentConfig }) {
  const num = tournament.tournament_num;
  const direct = tournament.direct_to_grand_final ?? 2;
  const semiCount = tournament.to_semifinal ?? 8;
  const [rows, setRows] = useState<QualifierRow[] | null>(null);
  const [regs, setRegs] = useState<SemiRegistration[]>([]);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [start, setStart] = useState(() => dayValue(new Date()));
  const [end, setEnd] = useState(() => dayValue(new Date(Date.now() + 21 * 86_400_000)));
  const [target, setTarget] = useState(2);
  const [draft, setDraft] = useState<SemiDraft | null>(null);
  const [running, setRunning] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [existing, setExisting] = useState<number | null>(null);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    setRows(null); setDraft(null); setSkipped(new Set());
    void Promise.all([
      supabase.from("tournament_matches").select("round_type, table_identifier, player_name, discord_username, placement, points, is_backup").eq("tournament_num", num),
      supabase.from("tournament_registrations").select("direwolf_name, discord_username, availability, updated_at").eq("tournament_num", num),
    ]).then(([m, r]) => {
      if (m.error) toast.error(m.error.message);
      if (r.error) toast.error(r.error.message);
      setRows((m.data ?? []) as QualifierRow[]);
      setRegs((r.data ?? []) as SemiRegistration[]);
    });
  }, [num]);

  const standings = useMemo(() => computeStandings(rows ?? []), [rows]);
  const eligible = standings.filter((s) => !skipped.has(s.player));
  const grandFinal = eligible.slice(0, direct);
  const pool = eligible.slice(direct, direct + semiCount);
  const poolSet = new Set(pool.map((s) => s.player));
  const gfSet = new Set(grandFinal.map((s) => s.player));
  const maxGames = Math.max(0, ...standings.map((s) => s.games));

  useEffect(() => setDraft(null), [skipped, start, end, target]);

  const toggleSkip = (p: string) => setSkipped((prev) => { const n = new Set(prev); if (n.has(p)) n.delete(p); else n.add(p); return n; });

  const run = () => {
    setRunning(true);
    setTimeout(() => {
      const result = runSemiSearch({ pool, regs, windowStart: new Date(start), windowEnd: new Date(end), targetSlots: target });
      setDraft(result);
      setRunning(false);
      if (!result) toast.error(`Need a multiple of 4 semi-finalists (have ${pool.length}).`);
    }, 20);
  };

  const discordOf = (p: string) => standings.find((s) => s.player === p)?.discord ?? findRegistration(p, null, regs)?.discord_username ?? null;

  const openPublish = async () => {
    setExisting(null); setPublishOpen(true);
    const { count } = await supabase.from("tournament_matches").select("id", { count: "exact", head: true }).eq("tournament_num", num).eq("round_type", "Finals").like("table_identifier", "Semi Final%");
    setExisting(count ?? 0);
  };

  const publish = async () => {
    if (!draft) return;
    setPublishing(true);
    try {
      if (existing) {
        const { error } = await supabase.from("tournament_matches").delete().eq("tournament_num", num).eq("round_type", "Finals").like("table_identifier", "Semi Final%").is("placement", null);
        if (error) throw error;
      }
      const insert = draft.tables.flatMap((t) => t.players.map((p) => ({
        tournament_num: num,
        round_type: "Finals",
        table_identifier: t.name,
        player_name: p,
        discord_username: discordOf(p),
        table_score: Math.round(t.avgTp * 10) / 10,
        player_availability: t.slots.map((s) => new Date(s.start).toISOString()),
      })));
      const { error } = await supabase.from("tournament_matches").insert(insert);
      if (error) throw error;
      toast.success(`Published ${draft.tables.length} semi-final tables`);
      setPublishOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Publishing failed");
    } finally { setPublishing(false); }
  };

  const download = (name: string, text: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
  };

  if (rows == null) return <Card className="p-6 text-sm text-muted-foreground"><Loader2 className="mr-2 inline size-4 animate-spin" />Loading standings…</Card>;

  return (
    <div className="space-y-5">
      <Card className="border-sand/40 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl">Qualifier standings</h2>
            <p className="text-xs text-muted-foreground">Order: TP → wins → avg placement → VP → VP share %. Top {direct} go straight to the Grand Final, next {semiCount} play the semi-finals. Skip anyone to pull in the next player.</p>
          </div>
          <Badge variant="outline">{standings.length} players</Badge>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr>
              <th className="py-1 pr-2">#</th><th className="pr-2">Player</th><th className="pr-2">TP</th><th className="pr-2">Wins</th><th className="pr-2">Avg</th><th className="pr-2">VP</th><th className="pr-2">VP %</th><th className="pr-2">Games</th><th className="pr-2">Registration edited</th><th className="pr-2">Status</th><th />
            </tr></thead>
            <tbody>
              {standings.map((s) => {
                const reg = findRegistration(s.player, s.discord, regs);
                const isSkip = skipped.has(s.player);
                const status = isSkip ? "Skipped" : gfSet.has(s.player) ? "Grand Final" : poolSet.has(s.player) ? "Semi-final" : "Standby";
                return (
                  <tr key={s.player} className={`border-t border-border/40 ${isSkip ? "opacity-50" : ""}`}>
                    <td className="py-1.5 pr-2 text-muted-foreground">{s.rank}</td>
                    <td className="pr-2 font-medium">{s.player}</td>
                    <td className="pr-2">{s.tp}</td>
                    <td className="pr-2">{s.wins}</td>
                    <td className="pr-2">{s.avgPlacement.toFixed(2)}</td>
                    <td className="pr-2">{s.vp}</td>
                    <td className="pr-2">{s.vpPct.toFixed(1)}%</td>
                    <td className={`pr-2 ${s.games < maxGames ? "font-semibold text-coral" : ""}`}>{s.games}/{maxGames}</td>
                    <td className="pr-2 text-xs">{reg ? <>{fmt(reg.updated_at)} · <span className="text-muted-foreground">{ago(reg.updated_at)}</span></> : <span className="text-coral">No registration</span>}</td>
                    <td className="pr-2"><Badge variant={status === "Semi-final" || status === "Grand Final" ? "default" : "outline"} className="text-[10px]">{status}</Badge></td>
                    <td><Button size="sm" variant="ghost" className="h-7" onClick={() => toggleSkip(s.player)}>{isSkip ? <><UserPlus className="size-3" /> Restore</> : <><UserMinus className="size-3" /> Skip</>}</Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="border-sand/40 p-5">
        <h2 className="font-display text-xl">Search window</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-4 sm:items-end">
          <div><Label>From</Label><Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div><Label>Until</Label><Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          <div><Label>Suggestions per table</Label><Input type="number" min={1} max={3} value={target} onChange={(e) => setTarget(Math.min(3, Math.max(1, Number(e.target.value) || 1)))} /></div>
          <Button onClick={run} disabled={running || pool.length < 4}>{running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} Find trial seed</Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Tests every split of the {pool.length} semi-finalists into tables of 4, looking for 2-hour windows at least 10 hours apart (3/4 fallback) and balancing TP and rank between tables.</p>
      </Card>

      {draft && (
        <section className="border-y border-sand/50 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-teal"><CheckCircle2 className="size-5" /><span className="text-xs font-semibold uppercase">Trial seed — not published</span></div>
              <h2 className="mt-1 font-display text-2xl">Best semi-final split</h2>
              <p className="text-xs text-muted-foreground">{draft.partitionsTested} splits tested. Review, export, then publish.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={async () => { await navigator.clipboard.writeText(announcement(num, draft, grandFinal)); toast.success("Announcement copied"); }}><Clipboard className="size-4" /> Discord text</Button>
              <Button variant="outline" size="sm" onClick={() => download(`t${num}_semifinals_bot_ready.csv`, botCsv(num, draft, discordOf))}><Download className="size-4" /> Bot CSV</Button>
              <Button size="sm" onClick={openPublish}><Upload className="size-4" /> Publish</Button>
            </div>
          </div>
          {grandFinal.length > 0 && <p className="mt-3 flex items-center gap-2 text-sm"><Trophy className="size-4 text-sand" /> Direct to Grand Final: <strong>{grandFinal.map((s) => s.player).join(", ")}</strong></p>}
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {draft.tables.map((t) => (
              <Card key={t.name} className="p-4">
                <div className="flex items-center justify-between"><h3 className="font-display text-lg">{t.name}</h3><span className="text-xs text-muted-foreground">avg TP {t.avgTp.toFixed(1)} · avg rank {t.avgRank.toFixed(1)}</span></div>
                <ul className="mt-2 space-y-1 text-sm">
                  {t.players.map((p) => { const s = standings.find((x) => x.player === p); return <li key={p} className="flex justify-between"><span>#{s?.rank} {p}</span><span className="text-muted-foreground">{s?.tp} TP</span></li>; })}
                </ul>
                <div className="mt-3 space-y-1 text-xs">
                  {t.slots.length === 0 && <p className="text-coral">No shared 2-hour window found in this period.</p>}
                  {t.slots.map((s, i) => (
                    <p key={i}><Badge variant={s.type === "perfect" ? "default" : "outline"} className="mr-2 text-[10px]">{s.type === "perfect" ? "4/4" : "3/4"}</Badge>{new Date(s.start).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}{s.missing.length > 0 && <span className="text-coral"> · check {s.missing.join(", ")}</span>}</p>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      <AlertDialog open={publishOpen} onOpenChange={(o) => { if (!publishing) setPublishOpen(o); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish semi-finals to Tournament {num}?</AlertDialogTitle>
            <AlertDialogDescription>
              {existing == null ? "Checking existing semi-final tables…" : existing > 0 ? `${existing} existing semi-final seats found. Unplayed ones will be replaced; played results stay.` : "This adds the semi-final tables to the tournament page."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={publishing}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={publishing || existing == null} onClick={(e) => { e.preventDefault(); void publish(); }}>{publishing && <Loader2 className="size-4 animate-spin" />} Publish</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
