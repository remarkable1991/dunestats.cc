import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { parseScreenshot, saveGame } from "@/lib/games.functions";
import { normalizeNames } from "@/lib/name-normalize";
import { detectExpansions } from "@/lib/leaders";
import { detectTournamentFromPlayers } from "@/lib/tournament-detect";
import { tournamentModes } from "@/lib/tournament-config";
import { translateLeader, isCanonicalLeader, CANONICAL_LEADERS } from "@/lib/leader-translate";
import { submitMatch, detectTournamentTable } from "@/lib/match-submit";
import { toast } from "sonner";
import { Upload as UploadIcon, Loader2, CheckCircle2, Maximize2, GripVertical, Trophy } from "lucide-react";
import exampleMatch from "@/assets/example-match.png.asset.json";
import { EloDeltaLine, TournamentTag } from "@/components/EloDelta";

const TOURNAMENT_ROUND_OPTIONS = ["Game 1", "Game 2", "Game 3", "Finals"] as const;
const TOURNAMENT_TABLE_OPTIONS = [
  "Table 1","Table 2","Table 3","Table 4","Table 5","Table 6","Table 7",
  "Semi Final 1","Semi Final 2","Grand Final!",
];

export const Route = createFileRoute("/upload")({
  head: () => ({ meta: [{ title: "Upload match · Strategy Arena" }] }),
  component: UploadPage,
});

type Row = { placement: number; player_name: string; leader_name: string; points: number };

const MIN_ROWS = 3;
const MAX_ROWS = 4;
const emptyRows = (): Row[] =>
  Array.from({ length: MAX_ROWS }, (_, i) => ({ placement: i + 1, player_name: "", leader_name: "", points: 0 }));
const clampRows = (rs: Row[]): Row[] => {
  const trimmed = rs.slice(0, MAX_ROWS);
  while (trimmed.length < MIN_ROWS) {
    trimmed.push({ placement: trimmed.length + 1, player_name: "", leader_name: "", points: 0 });
  }
  return trimmed;
};

function UploadPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<Row[]>(emptyRows());
  const [board, setBoard] = useState<"base" | "uprising">("uprising");
  const [hasIx, setHasIx] = useState(false);
  const [hasEpic, setHasEpic] = useState(false);
  const [hasImmortality, setHasImmortality] = useState(false);
  const [hasBaseLeaders, setHasBaseLeaders] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [adjusted, setAdjusted] = useState(false);
  const [duplicateWarn, setDuplicateWarn] = useState(false);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [checkingDup, setCheckingDup] = useState(false);
  const [detectedTournamentNum, setDetectedTournamentNum] = useState<number | null>(null);
  const [detectedTable, setDetectedTable] = useState<{ round: string; table: string } | null>(null);
  const [notATournamentGame, setNotATournamentGame] = useState(false);
  const [tRound, setTRound] = useState<string>("Game 1");
  const [tTable, setTTable] = useState<string>("Table 1");
  type SaveResult = Awaited<ReturnType<typeof saveGame>>;
  const [lastSave, setLastSave] = useState<SaveResult | null>(null);
  const [lastMatchId, setLastMatchId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate({ to: "/auth" });
      else { setUserId(data.session.user.id); setChecking(false); }
    });
  }, [navigate]);

  // Paste-from-clipboard support
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of items) {
        if (it.kind === "file" && it.type.startsWith("image/")) {
          const f = it.getAsFile();
          if (f) { e.preventDefault(); void onFile(f); return; }
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFile = async (f: File | null) => {
    setFile(f);
    setRows(emptyRows());
    setScanned(false);
    setAdjusted(false);
    setDuplicateWarn(false);
    setConfirmDuplicate(false);
    setDetectedTournamentNum(null);
    setDetectedTable(null);
    setNotATournamentGame(false);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f ? URL.createObjectURL(f) : null);
    if (f) await analyze(f);
  };

  const analyze = async (f: File) => {
    setParsing(true);
    try {
      const b64 = await fileToBase64(f);
      const res = await parseScreenshot({ data: { imageBase64: b64, mimeType: f.type || "image/png" } });
      let didAdjust = false;
      const rawDetected = res.results.map((r) => {
        const translated = translateLeader(r.leader_name);
        if (translated && translated !== (r.leader_name ?? "").trim()) didAdjust = true;
        return {
          placement: r.placement,
          player_name: r.player_name,
          leader_name: translated ?? (r.leader_name ?? ""),
          points: r.points,
        };
      });
      const detected = await normalizeNames(rawDetected);
      for (let i = 0; i < detected.length; i++) {
        if (detected[i].player_name !== rawDetected[i].player_name) { didAdjust = true; break; }
      }
      setRows(clampRows(detected));
      setScanned(true);
      setAdjusted(didAdjust);
      const suggestion = detectExpansions(detected.map((d) => d.leader_name));
      setBoard(suggestion.board_version);
      setHasIx(suggestion.has_rise_of_ix);
      setHasBaseLeaders(suggestion.has_base_leaders);
      setHasEpic(false);
      setHasImmortality(false);

      // Auto-tag tournament + apply that tournament's mode profile
      // (e.g. T14 forces Immortality on). Config lives in tournament-config.ts.
      const tNum = await detectTournamentFromPlayers(detected.map((d) => d.player_name));
      setDetectedTournamentNum(tNum);
      const profile = tournamentModes(tNum);
      if (profile) {
        setBoard(profile.board_version);
        setHasIx(profile.has_rise_of_ix);
        setHasEpic(profile.has_epic_mode);
        setHasImmortality(profile.has_immortality);
        setHasBaseLeaders(profile.has_base_leaders);
      }

      // If the players match a known tournament table, remember which slot
      // so we can offer to update it as part of this submit.
      if (tNum) {
        const slot = await detectTournamentTable(tNum, detected.map((d) => d.player_name));
        if (slot) {
          setDetectedTable(slot);
          setTRound(slot.round);
          setTTable(slot.table);
        }
      }


      const unknown = detected.filter((d) => !isCanonicalLeader(d.leader_name)).length;
      if (unknown > 0) {
        toast.warning(`Detected ${res.results.length} players — ${unknown} leader${unknown > 1 ? "s" : ""} need manual selection.`);
      } else if (profile) {
        toast.success(`Detected Tournament #${tNum} — applied ${profile.subtitle}.`);
      } else {
        toast.success(`Detected ${res.results.length} players. Verify and submit.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read screenshot");
    } finally {
      setParsing(false);
    }
  };

  const save = async () => {
    if (rows.length < 2) return toast.error("Need at least 2 players");
    if (hasEpic && !hasIx) return toast.error("Epic Mode requires Rise of Ix.");
    const bad = rows.filter((r) => !isCanonicalLeader(r.leader_name));
    if (bad.length) return toast.error("Unrecognized leader — pick a valid leader from the dropdown for the highlighted row(s).");
    if (!userId) return toast.error("Sign in to submit");

    const tournamentActive = !notATournamentGame && detectedTournamentNum != null && !!detectedTable;
    const tournament = tournamentActive
      ? { num: detectedTournamentNum, round: tRound, table: tTable }
      : null;

    setSaving(true);
    setCheckingDup(!confirmDuplicate);
    try {
      const result = await submitMatch({
        userId,
        file,
        board,
        hasIx,
        hasEpic,
        hasImmortality,
        hasBaseLeaders,
        rows: rows.map((r) => ({
          placement: r.placement,
          player_name: r.player_name,
          leader_name: r.leader_name || null,
          points: r.points,
        })),
        tournament,
        confirmDuplicate,
      });
      if (result.status === "duplicate") {
        setDuplicateWarn(true);
        return;
      }
      setLastSave(result.saveResult);
      setLastMatchId(result.publicMatchId);
      if (result.tournamentApplied) {
        toast.success(`Submitted to Tournament #${tournament!.num} · ${tournament!.round} · ${tournament!.table} and global leaderboard.`);
      } else {
        toast.success("Match submitted! ELO updated.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
      setCheckingDup(false);
    }
  };

  const update = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const setPlayerCount = (n: 3 | 4) =>
    setRows((rs) => {
      const sorted = [...rs].sort((a, b) => a.placement - b.placement);
      if (sorted.length === n) return sorted;
      if (sorted.length > n) return sorted.slice(0, n).map((r, idx) => ({ ...r, placement: idx + 1 }));
      const next = [...sorted];
      while (next.length < n) next.push({ placement: next.length + 1, player_name: "", leader_name: "", points: 0 });
      return next.map((r, idx) => ({ ...r, placement: idx + 1 }));
    });

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const reorder = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    setRows((rs) => {
      const sorted = [...rs].sort((a, b) => a.placement - b.placement);
      const [moved] = sorted.splice(from, 1);
      sorted.splice(to, 0, moved);
      return sorted.map((r, idx) => ({ ...r, placement: idx + 1 }));
    });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith("image/")) void onFile(f);
  };

  if (checking) return null;

  const hasUnrecognized = scanned && rows.some((r) => !isCanonicalLeader(r.leader_name));
  const nameCounts = new Map<string, number>();
  for (const r of rows) {
    const k = r.player_name.trim().toLowerCase();
    if (k) nameCounts.set(k, (nameCounts.get(k) ?? 0) + 1);
  }
  const hasDupNames = scanned && Array.from(nameCounts.values()).some((n) => n > 1);

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto px-4 py-10 max-w-5xl">
        <h1 className="font-display text-3xl mb-2">Upload a match</h1>
        <p className="text-muted-foreground mb-8">
          Drop your Dune Imperium Digital end-screen screenshot — analysis starts automatically.
          Confirm the board version + expansions, review the players, then submit.
        </p>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="p-6 border-border/60 bg-card/70 shadow-arena">
            <div className="space-y-4">
              <div>
                <Label htmlFor="file">Screenshot</Label>
                <label
                  htmlFor="file"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={onDrop}
                  className="flex flex-col items-center justify-center border-2 border-dashed border-border/70 rounded-lg p-8 cursor-pointer hover:border-sand transition-colors bg-background/40"
                >
                  {preview ? (
                    <img src={preview} alt="preview" className="max-h-72 rounded shadow-arena" />
                  ) : (
                    <>
                      <UploadIcon className="size-8 text-sand mb-2" />
                      <span className="text-sm text-muted-foreground text-center">
                        Click, drag &amp; drop, or paste (Ctrl+V) a screenshot (PNG / JPG)
                      </span>
                    </>
                  )}
                  <Input
                    id="file"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <div className="mt-3 flex items-start gap-3 rounded-md border border-border/50 bg-background/30 p-2">
                  <Dialog>
                    <DialogTrigger asChild>
                      <button type="button" className="relative group shrink-0">
                        <img
                          src={exampleMatch.url}
                          alt="Example end-screen layout"
                          className="h-20 w-auto rounded border border-border/60 group-hover:border-sand transition"
                        />
                        <span className="absolute inset-0 flex items-center justify-center bg-background/40 opacity-0 group-hover:opacity-100 rounded">
                          <Maximize2 className="size-4 text-sand" />
                        </span>
                      </button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl p-2">
                      <img src={exampleMatch.url} alt="Example end-screen layout" className="w-full h-auto rounded" />
                    </DialogContent>
                  </Dialog>
                  <p className="text-xs text-muted-foreground">
                    Example screenshot — your end-screen should look like this. Click to expand.
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
                    <Label className="mb-2 block">Board version <span className="text-coral">*</span></Label>
                    <RadioGroup value={board} onValueChange={(v) => setBoard(v as "base" | "uprising")} className="grid grid-cols-2 gap-2">
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
                        <Checkbox checked={hasIx} onCheckedChange={(c) => { setHasIx(!!c); if (!c) setHasEpic(false); }} />
                        Rise of Ix
                      </label>
                      <label className={`flex items-center gap-2 ${hasIx ? "cursor-pointer" : "opacity-40 cursor-not-allowed"}`}>
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
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-lg">Detected results</h2>
              <div className="inline-flex rounded-md border border-border/60 overflow-hidden text-xs">
                <button
                  type="button"
                  onClick={() => setPlayerCount(3)}
                  className={`px-3 py-1.5 transition ${rows.length === 3 ? "bg-sand text-background" : "hover:bg-background/40 text-muted-foreground"}`}
                >
                  3 players
                </button>
                <button
                  type="button"
                  onClick={() => setPlayerCount(4)}
                  className={`px-3 py-1.5 transition border-l border-border/60 ${rows.length === 4 ? "bg-sand text-background" : "hover:bg-background/40 text-muted-foreground"}`}
                >
                  4 players
                </button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Matches must have between {MIN_ROWS} and {MAX_ROWS} players.
            </p>

              <div className="space-y-2">
                {rows
                  .slice()
                  .sort((a, b) => a.placement - b.placement)
                  .map((r, i) => {
                    const invalid = scanned && !isCanonicalLeader(r.leader_name);
                    return (
                    <div
                      key={i}
                      draggable
                      onDragStart={() => setDragIdx(i)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.preventDefault(); if (dragIdx !== null) reorder(dragIdx, i); setDragIdx(null); }}
                      onDragEnd={() => setDragIdx(null)}
                      className={`grid grid-cols-[auto_minmax(0,9fr)_minmax(0,19fr)_44px] gap-2 items-center rounded-md px-1 py-1.5 ${invalid ? "ring-1 ring-coral/70 bg-coral/5" : ""} ${dragIdx === i ? "opacity-60" : ""}`}
                    >
                      <div className="flex items-center gap-0.5 select-none pr-1">
                        <GripVertical className="size-4 cursor-grab active:cursor-grabbing text-muted-foreground/70" />
                        <span className="font-display text-sand text-sm w-4 text-center tabular-nums">{r.placement}</span>
                      </div>
                      <Input
                        value={r.player_name}
                        onChange={(e) => update(i, { player_name: e.target.value })}
                        placeholder="Player"
                        className="w-full"
                      />
                      <Select
                        value={isCanonicalLeader(r.leader_name) ? r.leader_name : ""}
                        onValueChange={(v) => update(i, { leader_name: v })}
                      >
                        <SelectTrigger className={`min-w-0 ${invalid ? "border-coral text-coral" : ""}`}>
                          <span className="truncate block text-left flex-1">
                            <SelectValue placeholder={r.leader_name ? `Unrecognized: ${r.leader_name}` : "Select leader…"} />
                          </span>
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          {CANONICAL_LEADERS.map((name) => (
                            <SelectItem key={name} value={name}>{name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min={0}
                        maxLength={2}
                        value={r.points}
                        onChange={(e) => update(i, { points: Number(e.target.value) })}
                        className="text-center px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                    );
                  })}

                {hasUnrecognized && (
                  <div className="mt-2 rounded-md border border-coral/60 bg-coral/10 text-coral text-xs px-3 py-2">
                    Unrecognized match layout — select a valid leader for the highlighted row(s) before submitting.
                  </div>
                )}
                {scanned && adjusted && (
                  <div className="mt-2 rounded-md border border-orange-500/60 bg-orange-500/10 text-orange-300 text-xs px-3 py-2">
                    Please double-check if all info is correct as what was parsed was slightly adjusted during translation normalization.
                  </div>
                )}
                {hasDupNames && (
                  <div className="mt-2 rounded-md border border-yellow-500/60 bg-yellow-500/10 text-yellow-200 text-xs px-3 py-2 space-y-2">
                    <p>Duplicate player names detected at this table. How should this match be recorded?</p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" disabled title="This upload page only records global leaderboard games.">
                        Upload as a Tournament Game
                      </Button>
                      <Button size="sm" onClick={() => save()}>
                        Upload for Global Leaderboard Only
                      </Button>
                    </div>
                  </div>
                )}
                {duplicateWarn && (
                  <div className="mt-2 rounded-md border border-red-500/70 bg-red-500/10 text-red-300 text-xs px-3 py-2 space-y-2">
                    <p className="font-medium">This game appears to have been recently uploaded. Are you sure you want to submit it again?</p>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={confirmDuplicate}
                        onCheckedChange={(c) => setConfirmDuplicate(!!c)}
                      />
                      <span>Yes, submit anyway (override duplicate protection)</span>
                    </label>
                  </div>
                )}
                {detectedTournamentNum != null && detectedTable && (
                  <div className="mt-3 rounded-md border border-sand/50 bg-sand/5 p-3 space-y-2">
                    <div className="flex items-center gap-2 text-sm text-sand">
                      <Trophy className="size-4" />
                      <span className="font-medium">Tournament match detected</span>
                    </div>
                    {!notATournamentGame ? (
                      <>
                        <p className="text-xs text-muted-foreground">
                          Will also update Tournament #{detectedTournamentNum} · this table's slot.
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <Label className="text-xs">Tournament</Label>
                            <Select value={String(detectedTournamentNum)} disabled>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent><SelectItem value={String(detectedTournamentNum)}>{detectedTournamentNum}</SelectItem></SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs">Round</Label>
                            <Select value={tRound} onValueChange={setTRound}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {TOURNAMENT_ROUND_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs">Table</Label>
                            <Select value={tTable} onValueChange={setTTable}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {TOURNAMENT_TABLE_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">Will only be recorded on the global leaderboard.</p>
                    )}
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <Checkbox
                        checked={notATournamentGame}
                        onCheckedChange={(c) => setNotATournamentGame(!!c)}
                      />
                      This is not a tournament game
                    </label>
                  </div>
                )}
                <Button
                  onClick={save}
                  disabled={saving || checkingDup || hasUnrecognized || (duplicateWarn && !confirmDuplicate)}
                  className="w-full mt-4"
                >
                  {saving || checkingDup ? (
                    <><Loader2 className="size-4 animate-spin" /> {checkingDup ? "Checking duplicates…" : "Submitting…"}</>
                  ) : (
                    <><CheckCircle2 className="size-4" />
                      {duplicateWarn
                        ? "Confirm & submit"
                        : detectedTournamentNum != null && detectedTable && !notATournamentGame
                          ? `Submit to ${tRound} · ${tTable}`
                          : "Submit match"}
                    </>
                  )}
                </Button>
              </div>
          </Card>
        </div>
        {lastSave && (
          <Card className="p-4 mt-6 border-sand/40 bg-card/70">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <CheckCircle2 className="size-5 text-emerald-400" />
              <h2 className="font-display text-lg">Match saved</h2>
              <TournamentTag num={lastSave.tournament_num} />
            </div>
            {lastMatchId && (
              <div className="mb-4 rounded-md border border-sand/40 bg-sand/5 p-3 flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">Match ID:</span>
                <span className="font-mono text-sand font-medium">#{lastMatchId}</span>
                <div className="ml-auto flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(`https://dunestats.cc/match/${lastMatchId}`);
                        toast.success("Match link copied!");
                      } catch {
                        toast.error("Could not copy link");
                      }
                    }}
                  >
                    Copy Link
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => navigate({ to: "/match/$matchId", params: { matchId: lastMatchId } })}
                  >
                    View Match Page
                  </Button>
                </div>
              </div>
            )}
            <ul className="space-y-1 text-sm">
              {[...lastSave.deltas].sort((a, b) => a.placement - b.placement).map((d, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex size-5 items-center justify-center rounded bg-secondary/60 text-[10px] font-bold">{d.placement}</span>
                  <span className="font-medium">{d.player_name}</span>
                  <EloDeltaLine version={lastSave.game_version} overall={d.overall_delta} versionDelta={d.version_delta} />
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-end">
              <Button size="sm" variant="ghost" onClick={() => navigate({ to: "/leaderboard" })}>
                Go to leaderboard
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
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

/** Check the last 100 uploaded games for an identical fingerprint. */
async function checkRecentDuplicate(rows: Row[]): Promise<boolean> {
  const fp = fingerprint(rows);
  const { data: recent } = await supabase
    .from("games")
    .select("id, game_results(placement, player_name, leader_name, points)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (!recent) return false;
  for (const g of recent) {
    const gr = (g as { game_results?: Array<{ placement: number; player_name: string; leader_name: string | null; points: number }> }).game_results ?? [];
    if (gr.length !== rows.length) continue;
    const other = gr.map((r) => ({
      placement: r.placement,
      player_name: r.player_name,
      leader_name: r.leader_name ?? "",
      points: r.points,
    }));
    if (fingerprint(other) === fp) return true;
  }
  return false;
}

function fingerprint(rows: Row[]): string {
  return rows
    .map((r) => `${r.placement}|${r.player_name.trim().toLowerCase()}|${(r.leader_name ?? "").trim().toLowerCase()}|${Number(r.points) || 0}`)
    .sort()
    .join("::");
}
