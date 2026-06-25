import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { parseScreenshot, saveGame } from "@/lib/games.functions";
import { GAME_VERSIONS, type GameVersion } from "@/lib/game-version";
import { toast } from "sonner";
import { Upload as UploadIcon, Loader2, Trash2, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/upload")({
  head: () => ({ meta: [{ title: "Upload match · Strategy Arena" }] }),
  component: UploadPage,
});

type Row = { placement: number; player_name: string; leader_name: string; points: number };

function UploadPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState<GameVersion>("uprising");
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate({ to: "/auth" });
      else setChecking(false);
    });
  }, [navigate]);

  const onFile = (f: File | null) => {
    setFile(f);
    setRows([]);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f ? URL.createObjectURL(f) : null);
  };

  const analyze = async () => {
    if (!file) return;
    setParsing(true);
    try {
      const b64 = await fileToBase64(file);
      const res = await parseScreenshot({ data: { imageBase64: b64, mimeType: file.type || "image/png" } });
      setRows(
        res.results.map((r) => ({
          placement: r.placement,
          player_name: r.player_name,
          leader_name: r.leader_name ?? "",
          points: r.points,
        })),
      );
      toast.success(`Detected ${res.results.length} players. Verify and submit.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read screenshot");
    } finally {
      setParsing(false);
    }
  };

  const save = async () => {
    if (rows.length < 2) return toast.error("Need at least 2 players");
    setSaving(true);
    try {
      await saveGame({
        data: {
          game_version: version,
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
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));
  const addRow = () =>
    setRows((rs) => [...rs, { placement: rs.length + 1, player_name: "", leader_name: "", points: 0 }]);

  if (checking) return null;

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto px-4 py-10 max-w-5xl">
        <h1 className="font-display text-3xl mb-2">Upload a match</h1>
        <p className="text-muted-foreground mb-8">
          Drop your Dune Imperium Digital end-screen screenshot. The AI will extract rank, player name, leader, and
          points — review and submit.
        </p>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="p-6 border-border/60 bg-card/70 shadow-arena">
            <div className="space-y-4">
              <div>
                <Label>Game version</Label>
                <Select value={version} onValueChange={(v) => setVersion(v as GameVersion)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {GAME_VERSIONS.map((v) => (
                      <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="file">Screenshot</Label>
                <label
                  htmlFor="file"
                  className="flex flex-col items-center justify-center border-2 border-dashed border-border/70 rounded-lg p-8 cursor-pointer hover:border-sand transition-colors bg-background/40"
                >
                  {preview ? (
                    <img src={preview} alt="preview" className="max-h-72 rounded shadow-arena" />
                  ) : (
                    <>
                      <UploadIcon className="size-8 text-sand mb-2" />
                      <span className="text-sm text-muted-foreground">Click to choose a screenshot (PNG / JPG)</span>
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
              </div>

              <Button onClick={analyze} disabled={!file || parsing} className="w-full">
                {parsing ? (<><Loader2 className="size-4 animate-spin" /> Analysing…</>) : "Analyse with AI"}
              </Button>
            </div>
          </Card>

          <Card className="p-6 border-border/60 bg-card/70 shadow-arena">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-lg">Detected results</h2>
              <Button size="sm" variant="ghost" onClick={addRow}>+ Add row</Button>
            </div>

            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">
                Upload a screenshot and click <span className="text-sand">Analyse</span> to populate the results.
              </p>
            ) : (
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
                      <Button variant="ghost" size="icon" onClick={() => removeRow(i)}>
                        <Trash2 className="size-4 text-coral" />
                      </Button>
                    </div>
                  ))}

                <Button onClick={save} disabled={saving} className="w-full mt-4">
                  {saving ? (<><Loader2 className="size-4 animate-spin" /> Submitting…</>) : (<><CheckCircle2 className="size-4" /> Submit match</>)}
                </Button>
              </div>
            )}
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
