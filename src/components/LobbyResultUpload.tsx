import { useCallback, useEffect, useMemo, useState } from "react";
import { duplicateLeaders, reportMatchForReview } from "@/lib/duplicate-leaders";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { parseScreenshot } from "@/lib/games.functions";
import { normalizeNames } from "@/lib/name-normalize";
import { translateLeader, isCanonicalLeader, CANONICAL_LEADERS } from "@/lib/leader-translate";
import { submitMatch } from "@/lib/match-submit";
import { linkMatchToLobby, lobbyFormat } from "@/lib/league-lobby-detect";
import { recordResultIdentities } from "@/lib/lfg-history.functions";
import { loose, matchScreenshotToSeats, type MatchStatus } from "@/lib/lobby-result-match";
import type { LfgRow, Seat } from "@/lib/lfg-seats";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, Loader2, Upload, X, Maximize2 } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import exampleMatch from "@/assets/example-match.png.asset.json";

type Row = { placement: number; player_name: string; leader_name: string; points: number };

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { const s = String(r.result); resolve(s.includes(",") ? s.split(",")[1] : s); };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

const STATUS_STYLE: Record<MatchStatus, string> = {
  green: "text-teal border-teal/50 bg-teal/10",
  yellow: "text-primary border-primary/50 bg-primary/10",
  orange: "text-destructive border-destructive/50 bg-destructive/10",
};

function StatusBadge({ status }: { status: MatchStatus }) {
  return (
    <span className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full border ${STATUS_STYLE[status]}`} title={status}>
      {status === "green" ? <CheckCircle2 className="size-4" /> : <span className="font-bold text-sm">!</span>}
    </span>
  );
}

export function LobbyResultUpload({ row, seats, userId, onDone }: { row: LfgRow; seats: Seat[]; userId: string | null; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [games, setGames] = useState<Record<string, number>>({});
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dup, setDup] = useState(false);

  useEffect(() => {
    const keys = [...new Set(seats.flatMap((s) => [s.playerKey, s.name.toLowerCase()]).filter((k): k is string => !!k))];
    if (!keys.length) return;
    void supabase.from("player_ratings").select("player_key,games_played").eq("game_version", "overall").in("player_key", keys).then(({ data }) => {
      const m: Record<string, number> = {};
      for (const r of data ?? []) m[loose(r.player_key)] = Math.max(m[loose(r.player_key)] ?? 0, r.games_played);
      setGames(m);
    });
  }, [seats]);

  const analyze = useCallback(async (f: File) => {
    setFile(f); setDup(false); setRows([]);
    setPreview((p) => { if (p) URL.revokeObjectURL(p); return URL.createObjectURL(f); });
    setParsing(true);
    try {
      const res = await parseScreenshot({ data: { imageBase64: await fileToBase64(f), mimeType: f.type || "image/png" } });
      const raw = res.results.slice(0, 4).map((r) => ({ placement: r.placement, player_name: r.player_name, leader_name: translateLeader(r.leader_name) ?? (r.leader_name ?? ""), points: r.points }));
      setRows(await normalizeNames(raw));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read screenshot");
    } finally { setParsing(false); }
  }, []);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      for (const it of e.clipboardData?.items ?? []) {
        if (it.kind === "file" && it.type.startsWith("image/")) { const f = it.getAsFile(); if (f) { e.preventDefault(); void analyze(f); return; } }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [analyze]);

  const report = useMemo(() => matchScreenshotToSeats(rows.map((r) => r.player_name), seats.map((s) => ({ name: s.name, playerKey: s.playerKey, discordHandle: s.discordHandle, identityVerified: s.identityVerified })), games), [rows, seats, games]);
  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const reset = () => { setFile(null); setRows([]); setDup(false); setPreview((p) => { if (p) URL.revokeObjectURL(p); return null; }); };

  const submit = async () => {
    if (!userId) return toast.error("Sign in to submit");
    if (rows.length < 3) return toast.error("Need at least 3 players");
    if (rows.some((r) => !r.player_name.trim() || !isCanonicalLeader(r.leader_name))) return toast.error("Fill in every name and pick a valid leader.");
    const dupLeaders = duplicateLeaders(rows.map((r) => r.leader_name));
    if (dupLeaders.length && !confirm(`The same leader is listed more than once (${dupLeaders.join(", ")}). Submit anyway? The match will be marked "Needs review".`)) return;
    const f = lobbyFormat(row);
    setSaving(true);
    try {
      const result = await submitMatch({
        userId, file, board: f.board, hasIx: f.hasIx, hasEpic: f.hasEpic, hasImmortality: f.hasImmortality, hasBaseLeaders: f.hasBaseLeaders,
        rows: rows.map((r) => ({ placement: r.placement, player_name: r.player_name.trim(), leader_name: r.leader_name, points: r.points })),
        tournament: null, pendingTournament: null, confirmDuplicate: dup, playMode: f.playMode,
      });
      if (result.status === "duplicate") { setDup(true); toast.warning("This looks like an already uploaded game. Press submit again to confirm."); return; }
      await linkMatchToLobby(row.id, result.publicMatchId);
      // Remember who is who: confirmed or only-remaining seats get a Discord ↔ IGN mapping (existing mappings are never overwritten).
      const pairs = report.rows.flatMap((m) => {
        const s = m.seatIndex != null ? seats[m.seatIndex] : null;
        return s?.discordId && m.status !== "orange" ? [{ discord_user_id: s.discordId, player_name: rows[m.rowIndex]?.player_name.trim() ?? m.screenshotName }] : [];
      });
      if (pairs.length) await recordResultIdentities({ data: { lobbyId: row.id, pairs } }).catch((e) => console.error("Identity mapping failed", e));
      if (dupLeaders.length) {
        const { data: dg } = await supabase.from("games").select("id").eq("public_match_id", result.publicMatchId).maybeSingle();
        if (dg?.id) await reportMatchForReview(dg.id, `Duplicate leaders on upload: ${dupLeaders.join(", ")}`).catch((e) => console.error(e));
      }
      if (report.status !== "green") {
        const { data: g } = await supabase.from("games").select("id").eq("public_match_id", result.publicMatchId).maybeSingle();
        const { error } = await supabase.from("lfg_result_reviews" as never).insert({
          lobby_id: row.id, game_id: g?.id ?? null, public_match_id: result.publicMatchId, status: report.status, submitted_by: userId,
          players: { rows: report.rows, missing: report.missing },
        } as never);
        if (error) console.error("Review flag failed", error);
        toast.success("Result saved. An admin will double-check the player names in the next few days.");
      } else toast.success("Result saved and linked to this lobby.");
      reset();
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  };

  if (!file) {
    const f = lobbyFormat(row);
    const tags = [
      `Board: ${f.board}`,
      f.hasIx ? "Rise of Ix" : null,
      f.hasImmortality ? "Immortality" : null,
      f.hasEpic ? "Epic mode" : null,
      f.hasBaseLeaders ? "Base leaders" : null,
      f.playMode ? (f.playMode === "live" ? "Live" : "Async") : null,
    ].filter(Boolean) as string[];
    return (
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          <label htmlFor="lobby-upload" onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const fl = e.dataTransfer.files?.[0]; if (fl?.type.startsWith("image/")) void analyze(fl); }}
            className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border/70 bg-background/40 p-8 text-center text-sm text-muted-foreground cursor-pointer hover:border-primary transition-colors">
            <Upload className="size-8 text-primary" />
            <span>Click, drag &amp; drop, or paste (Ctrl+V) the end-of-game screenshot (PNG / JPG).</span>
          </label>
          <input id="lobby-upload" type="file" accept="image/*" className="hidden" onChange={(e) => { const fl = e.target.files?.[0]; if (fl) void analyze(fl); }} />
          <div className="flex items-start gap-3 rounded-md border border-border/50 bg-background/30 p-2">
            <Dialog>
              <DialogTrigger asChild>
                <button type="button" className="relative group shrink-0">
                  <img src={exampleMatch.url} alt="Example end-screen" className="h-20 w-auto rounded border border-border/60 group-hover:border-primary transition" />
                  <span className="absolute inset-0 flex items-center justify-center bg-background/40 opacity-0 group-hover:opacity-100 rounded"><Maximize2 className="size-4 text-primary" /></span>
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl p-2">
                <img src={exampleMatch.url} alt="Example end-screen" className="w-full h-auto rounded" />
              </DialogContent>
            </Dialog>
            <p className="text-xs text-muted-foreground">Example end-screen — your screenshot should look like this. Click to expand.</p>
          </div>
        </div>
        <Card className="p-4 space-y-3 bg-background/40">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Game type</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="rounded border border-primary/60 bg-primary/10 px-2 py-0.5 text-sm text-primary">{row.is_league ? "League" : "Lobby"} · Lobby #{row.id}</span>
              <span className="text-xs text-muted-foreground">Set automatically</span>
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Game settings (from this lobby)</div>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {tags.map((t) => <span key={t} className="rounded border border-border/60 px-2 py-0.5 text-xs">{t}</span>)}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">After the scan you'll see who was matched to which seat before you submit.</p>
        </Card>
      </div>
    );
  }

  const seatLabel = (i: number | null) => {
    if (i == null) return null;
    const s = seats[i];
    return s.discordHandle && loose(s.discordHandle) !== loose(s.name) ? `${s.name} · @${s.discordHandle}` : s.name;
  };

  return (
    <Card className="p-4 space-y-4 bg-background/40">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-medium">
          {parsing ? <Loader2 className="size-4 animate-spin" /> : <StatusBadge status={report.status} />}
          {parsing ? "Reading screenshot…" : report.status === "green" ? "All players confirmed" : "Some players need a second look"}
        </div>
        <Button size="icon" variant="ghost" onClick={reset} aria-label="Remove screenshot" disabled={saving}><X className="size-4" /></Button>
      </div>
      {preview && <img src={preview} alt="Uploaded end-of-game screenshot" className="max-h-64 rounded-md border border-border object-contain" />}
      {!parsing && rows.length > 0 && (
        <div className="space-y-2">
          {[...rows].map((r, i) => {
            const m = report.rows[i];
            return (
              <div key={i} className="grid gap-2 items-center sm:grid-cols-[2rem_1fr_1fr_5rem_1fr] rounded-md border border-border/60 p-2">
                <span className="font-display text-lg text-center">#{r.placement}</span>
                <Input value={r.player_name} onChange={(e) => update(i, { player_name: e.target.value })} aria-label={`Player ${i + 1} in-game name`} />
                <Select value={isCanonicalLeader(r.leader_name) ? r.leader_name : undefined} onValueChange={(v) => update(i, { leader_name: v })}>
                  <SelectTrigger aria-label={`Player ${i + 1} leader`} className={isCanonicalLeader(r.leader_name) ? "" : "border-destructive"}><SelectValue placeholder={r.leader_name || "Pick leader"} /></SelectTrigger>
                  <SelectContent>{CANONICAL_LEADERS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                </Select>
                <Input type="number" value={r.points} onChange={(e) => update(i, { points: Number(e.target.value) || 0 })} aria-label={`Player ${i + 1} VP`} />
                <div className="flex items-center gap-2 min-w-0">
                  {m && <StatusBadge status={m.status} />}
                  <div className="min-w-0 text-sm">
                    <div className="truncate">{seatLabel(m?.seatIndex ?? null) ?? <span className="text-muted-foreground">No seat</span>}</div>
                    <div className="text-xs text-muted-foreground truncate">{m?.reason}</div>
                  </div>
                </div>
              </div>
            );
          })}
          {report.missing.map((v) => (
            <p key={v.seatIndex} className="flex items-center gap-2 text-sm text-destructive"><AlertTriangle className="size-4" /> {v.seatName} ({v.games} games) is seated but not on the screenshot.</p>
          ))}
          {duplicateLeaders(rows.map((r) => r.leader_name)).length > 0 && (
            <p className="flex items-center gap-2 text-sm text-destructive"><AlertTriangle className="size-4" /> The same leader appears more than once. Check the leaders — if you submit anyway, the match is marked "Needs review".</p>
          )}
          {report.status !== "green" && (
            <p className="text-xs text-muted-foreground">You can still submit. Because not every player is confirmed, an admin will check it in the next few days.</p>
          )}
          <div className="flex items-center gap-3">
            <Button onClick={() => void submit()} disabled={saving}>{saving && <Loader2 className="size-4 animate-spin" />}{dup ? "Confirm duplicate & submit" : "Submit result"}</Button>
            <Link to="/upload" className="text-xs text-muted-foreground hover:underline">Use the full upload page instead</Link>
          </div>
        </div>
      )}
    </Card>
  );
}
