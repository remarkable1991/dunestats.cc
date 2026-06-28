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
import { supabase } from "@/integrations/supabase/client";
import { parseScreenshot, saveGame } from "@/lib/games.functions";
import { detectExpansions } from "@/lib/leaders";
import { toast } from "sonner";
import { Upload as UploadIcon, Loader2, Trash2, CheckCircle2, Maximize2 } from "lucide-react";
import exampleMatch from "@/assets/example-match.png.asset.json";

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
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f ? URL.createObjectURL(f) : null);
    if (f) await analyze(f);
  };

  const analyze = async (f: File) => {
    setParsing(true);
    try {
      const b64 = await fileToBase64(f);
      const res = await parseScreenshot({ data: { imageBase64: b64, mimeType: f.type || "image/png" } });
      const detected = res.results.map((r) => ({
        placement: r.placement,
        player_name: r.player_name,
        leader_name: r.leader_name ?? "",
        points: r.points,
      }));
      setRows(clampRows(detected));
      const suggestion = detectExpansions(detected.map((d) => d.leader_name));
      setBoard(suggestion.board_version);
      setHasIx(suggestion.has_rise_of_ix);
      setHasBaseLeaders(suggestion.has_base_leaders);
      setHasEpic(false);
      setHasImmortality(false);
      toast.success(`Detected ${res.results.length} players. Verify and submit.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read screenshot");
    } finally {
      setParsing(false);
    }
  };

  const save = async () => {
    if (rows.length < 2) return toast.error("Need at least 2 players");
    if (hasEpic && !hasIx) return toast.error("Epic Mode requires Rise of Ix.");
    setSaving(true);
    try {
      let match_screenshot_url: string | null = null;
      if (file && userId) {
        const ext = (file.name.split(".").pop() || "png").toLowerCase();
        const path = `${userId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("match-screenshots")
          .upload(path, file, { contentType: file.type || "image/png", upsert: false });
        if (upErr) throw upErr;
        match_screenshot_url = path;
      }
      await saveGame({
        data: {
          board_version: board,
          has_rise_of_ix: hasIx,
          has_epic_mode: hasEpic,
          has_immortality: hasImmortality,
          has_base_leaders: hasBaseLeaders,
          match_screenshot_url,
          results: rows.map((r) => ({
            placement: r.placement,
            player_name: r.player_name.trim(),
            leader_name: r.leader_name.trim() || null,
            points: Number(r.points) || 0,
          })),
        },
      });
      toast.success("Match submitted! ELO updated.");
      navigate({ to: "/leaderboard" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const update = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRow = (i: number) =>
    setRows((rs) => (rs.length <= MIN_ROWS ? rs : rs.filter((_, idx) => idx !== i)));
  const addRow = () =>
    setRows((rs) =>
      rs.length >= MAX_ROWS
        ? rs
        : [...rs, { placement: rs.length + 1, player_name: "", leader_name: "", points: 0 }],
    );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith("image/")) void onFile(f);
  };

  if (checking) return null;

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
              <Button size="sm" variant="ghost" onClick={addRow} disabled={rows.length >= MAX_ROWS}>
                + Add row
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Matches must have between {MIN_ROWS} and {MAX_ROWS} players.
            </p>

              <div className="space-y-2">
                {rows
                  .slice()
                  .sort((a, b) => a.placement - b.placement)
                  .map((r, i) => (
                    <div key={i} className="grid grid-cols-[40px_1fr_1fr_60px_32px] gap-2 items-center">
                      <Input
                        type="number"
                        min={1}
                        max={8}
                        value={r.placement}
                        onChange={(e) => update(i, { placement: Number(e.target.value) })}
                        className="text-center"
                      />
                      <Input
                        value={r.player_name}
                        onChange={(e) => update(i, { player_name: e.target.value })}
                        placeholder="Player"
                      />
                      <Input
                        value={r.leader_name}
                        onChange={(e) => update(i, { leader_name: e.target.value })}
                        placeholder="Leader"
                      />
                      <Input
                        type="number"
                        min={0}
                        value={r.points}
                        onChange={(e) => update(i, { points: Number(e.target.value) })}
                        className="text-center"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeRow(i)}
                        disabled={rows.length <= MIN_ROWS}
                      >
                        <Trash2 className="size-4 text-coral" />
                      </Button>
                    </div>
                  ))}

                <Button onClick={save} disabled={saving} className="w-full mt-4">
                  {saving ? (<><Loader2 className="size-4 animate-spin" /> Submitting…</>) : (<><CheckCircle2 className="size-4" /> Submit match</>)}
                </Button>
              </div>
          </Card>
        </div>
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
