import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus, Save, Trash2 } from "lucide-react";
import {
  MAX_CHECKBOXES,
  type TournamentCheckbox,
  type TournamentConfig,
  checkinStart,
  fetchTournaments,
  registrationClosesAt,
  tournamentDayCount,
  tournamentWeekCount,
} from "@/lib/tournaments";

export const Route = createFileRoute("/admin/tournaments")({
  head: () => ({
    meta: [
      { title: "Manage Tournaments — Strategy Arena" },
      { name: "description", content: "Admin tools to create and configure Strategy Arena tournaments." },
      { property: "og:title", content: "Manage Tournaments — Strategy Arena" },
      { property: "og:description", content: "Admin tools to create and configure Strategy Arena tournaments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminTournaments,
});

type Draft = {
  tournament_num: string;
  name: string;
  start_date: string;
  end_date: string;
  required_availability_pct: string;
  required_weekly_pct: string;
  checkboxes: TournamentCheckbox[];
  info_title: string;
  info_text: string;
  registration_open: boolean;
};

function toDraft(t: TournamentConfig): Draft {
  return {
    tournament_num: String(t.tournament_num),
    name: t.name,
    start_date: t.start_date,
    end_date: t.end_date,
    required_availability_pct: String(t.required_availability_pct),
    required_weekly_pct: String(t.required_weekly_pct),
    checkboxes: t.checkboxes,
    info_title: t.info_title ?? "",
    info_text: t.info_text ?? "",
    registration_open: t.registration_open,
  };
}

function emptyDraft(nextNum: number): Draft {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const start = new Date(today.getTime() + 14 * 86400000);
  const end = new Date(start.getTime() + 27 * 86400000);
  return {
    tournament_num: String(nextNum),
    name: `Tournament ${nextNum}`,
    start_date: iso(start),
    end_date: iso(end),
    required_availability_pct: "5",
    required_weekly_pct: "3",
    checkboxes: [
      { id: "owns_expansions", label: "I confirm that I own Dune Imperium Digital and the required expansions." },
      { id: "active_on_discord", label: "I confirm that I am active on the Strategy Arena Discord Server." },
    ],
    info_title: "",
    info_text: "",
    registration_open: true,
  };
}

function AdminTournaments() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tournaments, setTournaments] = useState<TournamentConfig[]>([]);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [isNew, setIsNew] = useState(false);

  const reload = async () => setTournaments(await fetchTournaments());

  useEffect(() => {
    void (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user.id;
      if (uid) {
        const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
        setIsAdmin((roles ?? []).some((r) => r.role === "admin"));
      }
      await reload();
      setLoading(false);
    })();
  }, []);

  const nextNum = useMemo(
    () => (tournaments.length ? Math.max(...tournaments.map((t) => t.tournament_num)) + 1 : 1),
    [tournaments],
  );

  if (loading) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="container mx-auto px-4 py-10 flex justify-center">
          <Loader2 className="size-6 animate-spin text-sand" />
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="container mx-auto px-4 py-10 max-w-2xl">
          <Card className="p-6 border-sand/40">
            <h1 className="font-display text-2xl mb-2">Admins only</h1>
            <p className="text-sm text-muted-foreground">
              You need an admin role to manage tournaments.{" "}
              <Link to="/tournament" className="text-sand underline">Back to tournaments</Link>
            </p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto px-4 py-6 max-w-4xl space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="font-display text-2xl sm:text-3xl">Manage Tournaments</h1>
          <div className="flex gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/tournament"><ArrowLeft className="size-4 mr-1" />Back</Link>
            </Button>
            <Button
              size="sm"
              className="bg-sand text-background hover:bg-sand/90 gap-1"
              onClick={() => { setEditing(emptyDraft(nextNum)); setIsNew(true); }}
            >
              <Plus className="size-4" /> New tournament
            </Button>
          </div>
        </div>

        {editing && (
          <TournamentForm
            draft={editing}
            isNew={isNew}
            onCancel={() => setEditing(null)}
            onSaved={async () => { setEditing(null); await reload(); }}
          />
        )}

        <div className="space-y-3">
          {tournaments.length === 0 && (
            <Card className="p-6 border-sand/40 text-sm text-muted-foreground">
              No tournaments configured yet. Create one to open registration.
            </Card>
          )}
          {tournaments.map((t) => (
            <Card key={t.tournament_num} className="p-4 border-sand/40 flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-1">
                <div className="font-display text-lg text-sand">
                  #{t.tournament_num} — {t.name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t.start_date} → {t.end_date} · {tournamentDayCount(t)} days ({tournamentWeekCount(t)} weeks)
                </div>
                <div className="text-xs text-muted-foreground">
                  Check-in opens {checkinStart(t).toLocaleString()} · Registration closes{" "}
                  {registrationClosesAt(t).toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground">
                  Min availability {t.required_availability_pct}% overall · {t.required_weekly_pct}% per week ·{" "}
                  {t.checkboxes.length} checkbox{t.checkboxes.length === 1 ? "" : "es"} ·{" "}
                  <span className={t.registration_open ? "text-green-500" : "text-destructive"}>
                    {t.registration_open ? "Registration open" : "Registration closed"}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setEditing(toDraft(t)); setIsNew(false); }}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={async () => {
                    if (!window.confirm(`Delete tournament #${t.tournament_num}?`)) return;
                    const { error } = await supabase
                      .from("tournaments")
                      .delete()
                      .eq("tournament_num", t.tournament_num);
                    if (error) { toast.error(error.message); return; }
                    toast.success("Tournament deleted");
                    await reload();
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function TournamentForm({
  draft: initial, isNew, onCancel, onSaved,
}: {
  draft: Draft;
  isNew: boolean;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(initial), [initial]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const save = async () => {
    const num = Number(draft.tournament_num);
    if (!Number.isInteger(num) || num <= 0) { toast.error("Tournament number must be a positive whole number"); return; }
    if (!draft.name.trim()) { toast.error("Name is required"); return; }
    if (!draft.start_date || !draft.end_date) { toast.error("Start and end dates are required"); return; }
    if (draft.end_date < draft.start_date) { toast.error("End date must be after the start date"); return; }
    const overall = Number(draft.required_availability_pct);
    const weekly = Number(draft.required_weekly_pct);
    if (!(overall >= 0 && overall <= 100) || !(weekly >= 0 && weekly <= 100)) {
      toast.error("Availability percentages must be between 0 and 100");
      return;
    }
    const boxes = draft.checkboxes
      .map((b, i) => ({ id: b.id || `c${i}`, label: b.label.trim() }))
      .filter((b) => b.label.length > 0)
      .slice(0, MAX_CHECKBOXES);

    setSaving(true);
    const payload = {
      tournament_num: num,
      name: draft.name.trim(),
      start_date: draft.start_date,
      end_date: draft.end_date,
      required_availability_pct: overall,
      required_weekly_pct: weekly,
      checkboxes: boxes,
      info_title: draft.info_title.trim() || null,
      info_text: draft.info_text.trim() || null,
      registration_open: draft.registration_open,
    };
    const { error } = await supabase.from("tournaments").upsert(payload, { onConflict: "tournament_num" });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(isNew ? "Tournament created" : "Tournament updated");
    await onSaved();
  };

  return (
    <Card className="p-6 border-sand/40 space-y-5">
      <h2 className="font-display text-lg">{isNew ? "New tournament" : `Edit tournament #${draft.tournament_num}`}</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="num">Tournament number</Label>
          <Input
            id="num"
            type="number"
            value={draft.tournament_num}
            disabled={!isNew}
            onChange={(e) => set("tournament_num", e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="name">Name / title</Label>
          <Input id="name" value={draft.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="start">Start date</Label>
          <Input id="start" type="date" value={draft.start_date} onChange={(e) => set("start_date", e.target.value)} />
          <p className="text-[11px] text-muted-foreground mt-1">
            First day of the availability grid. Check-in opens 24h earlier; registration closes 24h after.
          </p>
        </div>
        <div>
          <Label htmlFor="end">End date</Label>
          <Input id="end" type="date" value={draft.end_date} onChange={(e) => set("end_date", e.target.value)} />
          <p className="text-[11px] text-muted-foreground mt-1">Last day of the availability grid.</p>
        </div>
        <div>
          <Label htmlFor="pct">Required availability % (overall)</Label>
          <Input
            id="pct" type="number" min={0} max={100} step="0.5"
            value={draft.required_availability_pct}
            onChange={(e) => set("required_availability_pct", e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="wpct">Required availability % (per week)</Label>
          <Input
            id="wpct" type="number" min={0} max={100} step="0.5"
            value={draft.required_weekly_pct}
            onChange={(e) => set("required_weekly_pct", e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Required confirmation checkboxes (max {MAX_CHECKBOXES})</Label>
          {draft.checkboxes.length < MAX_CHECKBOXES && (
            <Button
              size="sm" variant="outline"
              onClick={() => set("checkboxes", [...draft.checkboxes, { id: `c${Date.now()}`, label: "" }])}
            >
              <Plus className="size-4 mr-1" /> Add checkbox
            </Button>
          )}
        </div>
        {draft.checkboxes.map((b, i) => (
          <div key={b.id} className="flex items-start gap-2">
            <Textarea
              value={b.label}
              rows={2}
              placeholder="What is the player confirming?"
              onChange={(e) => {
                const next = [...draft.checkboxes];
                next[i] = { ...b, label: e.target.value };
                set("checkboxes", next);
              }}
            />
            <Button
              size="sm" variant="ghost" className="text-destructive"
              onClick={() => set("checkboxes", draft.checkboxes.filter((_, j) => j !== i))}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        {draft.checkboxes.length === 0 && (
          <p className="text-xs text-muted-foreground">No checkboxes — players can register without confirmations.</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div>
          <Label htmlFor="itit">Tournament information — title</Label>
          <Input id="itit" value={draft.info_title} onChange={(e) => set("info_title", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="itxt">Tournament information — text</Label>
          <Textarea id="itxt" rows={5} value={draft.info_text} onChange={(e) => set("info_text", e.target.value)} />
        </div>
      </div>

      <label className="flex items-center gap-3 text-sm">
        <Switch checked={draft.registration_open} onCheckedChange={(v) => set("registration_open", v)} />
        Registration open
      </label>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button onClick={save} disabled={saving} className="bg-sand text-background hover:bg-sand/90 gap-2">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save
        </Button>
      </div>
    </Card>
  );
}
