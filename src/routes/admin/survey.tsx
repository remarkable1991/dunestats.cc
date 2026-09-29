import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, ArrowDown, ArrowUp, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { useRoles } from "@/hooks/use-roles";
import {
  QUESTION_TYPES,
  asOptions,
  formatLabel,
  type FormatPick,
  type QuestionType,
  type SurveyCategory,
  type SurveyOption,
  type SurveyQuestion,
} from "@/lib/survey";

export const Route = createFileRoute("/admin/survey")({
  head: () => ({
    meta: [
      { title: "Survey Manager — Strategy Arena" },
      { name: "description", content: "Edit the player survey questions and read the answers." },
      { property: "og:title", content: "Survey Manager — Strategy Arena" },
      { property: "og:description", content: "Edit the player survey questions and read the answers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminSurvey,
});

type ResponseRow = {
  id: string;
  category_id: string;
  user_id: string | null;
  answers: Record<string, unknown>;
  created_at: string;
};

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "option";
}

function AdminSurvey() {
  const roles = useRoles();
  const [cats, setCats] = useState<SurveyCategory[]>([]);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ kind: "question" | "category"; id: string; label: string } | null>(null);

  const load = useCallback(async () => {
    const [{ data: c }, { data: q }, { data: r }] = await Promise.all([
      supabase.from("survey_categories").select("*").order("sort_order"),
      supabase.from("survey_questions").select("*").order("sort_order"),
      supabase.from("survey_responses").select("*").order("created_at", { ascending: false }).limit(1000),
    ]);
    setCats((c ?? []) as unknown as SurveyCategory[]);
    setQuestions((q ?? []) as unknown as SurveyQuestion[]);
    setResponses((r ?? []) as unknown as ResponseRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (roles.loading || !roles.isAdmin) return;
    void load();
  }, [roles.loading, roles.isAdmin, load]);

  const byCat = useMemo(() => {
    const m: Record<string, SurveyQuestion[]> = {};
    questions.forEach((q) => (m[q.category_id] = [...(m[q.category_id] ?? []), q]));
    return m;
  }, [questions]);

  if (roles.loading) return null;
  if (!roles.isAdmin)
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="container mx-auto px-4 py-10 text-muted-foreground">Main admin only.</div>
      </div>
    );

  const patchQuestion = (id: string, patch: Partial<SurveyQuestion>) =>
    setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...patch } : q)));

  const patchCat = (id: string, patch: Partial<SurveyCategory>) =>
    setCats((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const saveQuestion = (q: SurveyQuestion) =>
    run(async () => {
      const { error } = await supabase
        .from("survey_questions")
        .update({
          prompt: q.prompt,
          help_text: q.help_text,
          question_type: q.question_type,
          options: q.options,
          is_required: q.is_required,
          is_active: q.is_active,
          sort_order: q.sort_order,
        })
        .eq("id", q.id);
      if (error) throw error;
    }, "Question saved");

  const saveCat = (c: SurveyCategory) =>
    run(async () => {
      const { error } = await supabase
        .from("survey_categories")
        .update({
          title: c.title,
          description: c.description,
          intro: c.intro,
          icon: c.icon,
          is_active: c.is_active,
          sort_order: c.sort_order,
        })
        .eq("id", c.id);
      if (error) throw error;
    }, "Topic saved");

  const addQuestion = (catId: string) =>
    run(async () => {
      const max = Math.max(0, ...(byCat[catId] ?? []).map((q) => q.sort_order));
      const { error } = await supabase.from("survey_questions").insert({
        category_id: catId,
        prompt: "New question",
        question_type: "single_choice",
        options: [],
        sort_order: max + 1,
      });
      if (error) throw error;
      await load();
    }, "Question added");

  const addCategory = () =>
    run(async () => {
      const max = Math.max(0, ...cats.map((c) => c.sort_order));
      const { error } = await supabase.from("survey_categories").insert({
        slug: `topic_${Date.now()}`,
        title: "New topic",
        description: "",
        sort_order: max + 1,
      });
      if (error) throw error;
      await load();
    }, "Topic added");

  const move = (q: SurveyQuestion, dir: -1 | 1) =>
    run(async () => {
      const list = (byCat[q.category_id] ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
      const i = list.findIndex((x) => x.id === q.id);
      const j = i + dir;
      if (j < 0 || j >= list.length) return;
      const a = list[i];
      const b = list[j];
      await supabase.from("survey_questions").update({ sort_order: b.sort_order }).eq("id", a.id);
      await supabase.from("survey_questions").update({ sort_order: a.sort_order }).eq("id", b.id);
      await load();
    }, "Order updated");

  const doDelete = () =>
    run(async () => {
      if (!confirmDelete) return;
      const table = confirmDelete.kind === "question" ? "survey_questions" : "survey_categories";
      const { error } = await supabase.from(table).delete().eq("id", confirmDelete.id);
      if (error) throw error;
      setConfirmDelete(null);
      await load();
    }, "Deleted");

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="container mx-auto max-w-5xl px-4 py-8">
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link to="/survey">
            <ArrowLeft className="size-4" /> View the survey
          </Link>
        </Button>
        <h1 className="mb-6 font-display text-3xl text-foreground">Survey Manager</h1>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : (
          <Tabs defaultValue="questions">
            <TabsList>
              <TabsTrigger value="questions">Questions</TabsTrigger>
              <TabsTrigger value="results">Answers ({responses.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="questions" className="space-y-6 pt-4">
              <Button variant="outline" size="sm" onClick={addCategory} disabled={busy}>
                <Plus className="size-4" /> Add topic
              </Button>

              {cats.map((c) => (
                <Card key={c.id} className="space-y-4 border-border/60 bg-card/60 p-5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Topic title</Label>
                      <Input value={c.title} onChange={(e) => patchCat(c.id, { title: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Short description</Label>
                      <Input
                        value={c.description}
                        onChange={(e) => patchCat(c.id, { description: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label>Intro shown at the top of the topic</Label>
                      <Input value={c.intro} onChange={(e) => patchCat(c.id, { intro: e.target.value })} />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <Switch
                        checked={c.is_active}
                        onCheckedChange={(v) => patchCat(c.id, { is_active: v })}
                      />
                      Visible to players
                    </label>
                    <Button size="sm" onClick={() => saveCat(c)} disabled={busy}>
                      <Save className="size-4" /> Save topic
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setConfirmDelete({ kind: "category", id: c.id, label: c.title })}
                    >
                      <Trash2 className="size-4" /> Delete topic
                    </Button>
                  </div>

                  <div className="space-y-4 border-t border-border/60 pt-4">
                    {(byCat[c.id] ?? []).map((q) => (
                      <QuestionEditor
                        key={q.id}
                        q={q}
                        busy={busy}
                        onPatch={(patch) => patchQuestion(q.id, patch)}
                        onSave={() => saveQuestion(q)}
                        onMove={(d) => move(q, d)}
                        onDelete={() => setConfirmDelete({ kind: "question", id: q.id, label: q.prompt })}
                      />
                    ))}
                    <Button variant="outline" size="sm" onClick={() => addQuestion(c.id)} disabled={busy}>
                      <Plus className="size-4" /> Add question to {c.title}
                    </Button>
                  </div>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="results" className="space-y-6 pt-4">
              {cats.map((c) => {
                const rows = responses.filter((r) => r.category_id === c.id);
                return (
                  <Card key={c.id} className="space-y-4 border-border/60 bg-card/60 p-5">
                    <div className="flex items-baseline justify-between">
                      <h2 className="font-display text-lg text-foreground">{c.title}</h2>
                      <span className="text-sm text-muted-foreground">{rows.length} answers</span>
                    </div>
                    {(byCat[c.id] ?? []).map((q) => (
                      <QuestionResults key={q.id} q={q} rows={rows} />
                    ))}
                  </Card>
                );
              })}
            </TabsContent>
          </Tabs>
        )}
      </main>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this {confirmDelete?.kind === "category" ? "topic" : "question"}?</AlertDialogTitle>
            <AlertDialogDescription>
              “{confirmDelete?.label}” will be removed.
              {confirmDelete?.kind === "category"
                ? " All of its questions and the answers people gave will be removed too."
                : " Answers already given stay stored but will no longer be shown."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function QuestionEditor({
  q,
  busy,
  onPatch,
  onSave,
  onMove,
  onDelete,
}: {
  q: SurveyQuestion;
  busy: boolean;
  onPatch: (p: Partial<SurveyQuestion>) => void;
  onSave: () => void;
  onMove: (d: -1 | 1) => void;
  onDelete: () => void;
}) {
  const opts = asOptions(q.options);
  const needsOptions = q.question_type === "single_choice" || q.question_type === "multi_choice";

  const setOpt = (i: number, patch: Partial<SurveyOption>) =>
    onPatch({ options: opts.map((o, idx) => (idx === i ? { ...o, ...patch } : o)) });

  return (
    <div className="space-y-3 rounded-md border border-border/60 bg-background/40 p-4">
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-2">
          <Input value={q.prompt} onChange={(e) => onPatch({ prompt: e.target.value })} />
          <Input
            value={q.help_text}
            placeholder="Helper text (optional)"
            onChange={(e) => onPatch({ help_text: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Button variant="ghost" size="sm" onClick={() => onMove(-1)} aria-label="Move up">
            <ArrowUp className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onMove(1)} aria-label="Move down">
            <ArrowDown className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Select
          value={q.question_type}
          onValueChange={(v) => onPatch({ question_type: v as QuestionType })}
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {QUESTION_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={q.is_required} onCheckedChange={(v) => onPatch({ is_required: v })} />
          Required
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={q.is_active} onCheckedChange={(v) => onPatch({ is_active: v })} />
          Shown
        </label>
      </div>

      {needsOptions && (
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Answer options</Label>
          {opts.map((o, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Input
                className="min-w-40 flex-1"
                value={o.label}
                placeholder="Option"
                onChange={(e) => setOpt(i, { label: e.target.value })}
              />
              <Input
                className="min-w-40 flex-1"
                value={o.hint ?? ""}
                placeholder="Extra explanation (optional)"
                onChange={(e) => setOpt(i, { hint: e.target.value })}
              />
              <Button
                variant="ghost"
                size="sm"
                aria-label="Remove option"
                onClick={() => onPatch({ options: opts.filter((_, idx) => idx !== i) })}
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              onPatch({
                options: [...opts, { value: `opt_${opts.length + 1}_${slugify("new")}`, label: "New option" }],
              })
            }
          >
            <Plus className="size-4" /> Add option
          </Button>
        </div>
      )}

      <Button size="sm" onClick={onSave} disabled={busy}>
        <Save className="size-4" /> Save question
      </Button>
    </div>
  );
}

function QuestionResults({ q, rows }: { q: SurveyQuestion; rows: ResponseRow[] }) {
  const values = rows.map((r) => r.answers?.[q.id]).filter((v) => v !== undefined && v !== null && v !== "");
  if (values.length === 0)
    return (
      <div className="border-t border-border/40 pt-3 text-sm">
        <p className="text-foreground">{q.prompt}</p>
        <p className="text-muted-foreground">No answers yet.</p>
      </div>
    );

  if (q.question_type === "stars") {
    const nums = values.filter((v): v is number => typeof v === "number" && v > 0);
    const avg = nums.reduce((a, b) => a + b, 0) / (nums.length || 1);
    return (
      <div className="border-t border-border/40 pt-3 text-sm">
        <p className="text-foreground">{q.prompt}</p>
        <p className="text-primary">
          {avg.toFixed(2)} / 5 · {nums.length} ratings
        </p>
      </div>
    );
  }

  if (q.question_type === "open_text") {
    return (
      <div className="border-t border-border/40 pt-3 text-sm">
        <p className="mb-1 text-foreground">{q.prompt}</p>
        <ul className="space-y-1">
          {values.map((v, i) => (
            <li key={i} className="rounded bg-background/50 px-2 py-1 text-muted-foreground">
              {String(v)}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (q.question_type === "format_builder") {
    const counts: Record<string, number> = {};
    values.forEach((v) => {
      (Array.isArray(v) ? (v as FormatPick[]) : []).forEach((p) => {
        if (!p || typeof p !== "object") return;
        const label = formatLabel(p);
        counts[label] = (counts[label] ?? 0) + 1;
      });
    });
    return (
      <div className="border-t border-border/40 pt-3 text-sm">
        <p className="mb-1 text-foreground">{q.prompt}</p>
        <Bars counts={counts} total={Object.values(counts).reduce((a, b) => a + b, 0)} />
      </div>
    );
  }

  const opts = asOptions(q.options);
  const counts: Record<string, number> = {};
  values.forEach((v) => {
    const list = Array.isArray(v) ? (v as string[]) : [String(v)];
    list.forEach((x) => (counts[x] = (counts[x] ?? 0) + 1));
  });
  const labelled: Record<string, number> = {};
  Object.entries(counts).forEach(([k, n]) => {
    labelled[opts.find((o) => o.value === k)?.label ?? k] = n;
  });
  return (
    <div className="border-t border-border/40 pt-3 text-sm">
      <p className="mb-1 text-foreground">{q.prompt}</p>
      <Bars counts={labelled} total={values.length} />
    </div>
  );
}

function Bars({ counts, total }: { counts: Record<string, number>; total: number }) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return (
    <div className="space-y-1">
      {entries.map(([label, n]) => (
        <div key={label} className="flex items-center gap-2">
          <span className="w-56 shrink-0 truncate text-muted-foreground">{label}</span>
          <div className="h-2 flex-1 rounded bg-muted">
            <div
              className="h-2 rounded bg-primary"
              style={{ width: `${total ? Math.round((n / total) * 100) : 0}%` }}
            />
          </div>
          <span className="w-16 shrink-0 text-right text-muted-foreground">
            {n} ({total ? Math.round((n / total) * 100) : 0}%)
          </span>
        </div>
      ))}
    </div>
  );
}
