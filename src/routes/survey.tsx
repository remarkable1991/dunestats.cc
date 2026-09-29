import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ArrowLeft,
  BarChart3,
  Check,
  Gift,
  Loader2,
  Sparkles,
  Star,
  Swords,
  Trophy,
} from "lucide-react";
import { SurveyFormatBuilder } from "@/components/SurveyFormatBuilder";
import {
  OPTION_IMAGES,
  asOptions,
  builderMax,
  emptyFormat,
  type FormatPick,
  type SurveyCategory,
  type SurveyQuestion,
} from "@/lib/survey";

export const Route = createFileRoute("/survey")({
  head: () => ({
    meta: [
      { title: "Player Survey · Strategy Arena" },
      {
        name: "description",
        content:
          "Tell us what you want from tournaments, a new league, rewards and stats. Pick a topic and answer in a minute or two.",
      },
      { property: "og:title", content: "Player Survey · Strategy Arena" },
      {
        property: "og:description",
        content: "Shape the next season: tournaments, league, rewards and stats.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SurveyPage,
});

const ICONS: Record<string, typeof Trophy> = {
  trophy: Trophy,
  swords: Swords,
  gift: Gift,
  "bar-chart-3": BarChart3,
  sparkles: Sparkles,
};

type AnswerValue = string | string[] | number | FormatPick[] | null;
type Answers = Record<string, AnswerValue>;

const DRAFT_KEY = "survey-drafts-v1";

function loadDrafts(): Record<string, Answers> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function sessionToken(): string {
  const key = "survey-session-token";
  let t = window.localStorage.getItem(key);
  if (!t) {
    t = crypto.randomUUID();
    window.localStorage.setItem(key, t);
  }
  return t;
}

function Stars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} of 5`}
          onMouseEnter={() => setHover(n)}
          onClick={() => onChange(value === n ? 0 : n)}
          className="p-0.5"
        >
          <Star
            className={`size-7 transition ${
              n <= shown ? "fill-primary text-primary" : "text-muted-foreground/40"
            }`}
          />
        </button>
      ))}
      <span className="ml-2 text-sm text-muted-foreground">{value ? `${value}/5` : "Not rated"}</span>
    </div>
  );
}

function SurveyPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [cats, setCats] = useState<SurveyCategory[]>([]);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, Answers>>({});
  const [openCat, setOpenCat] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDrafts(loadDrafts());
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
  }, []);

  const load = useCallback(async () => {
    const [{ data: c }, { data: q }] = await Promise.all([
      supabase.from("survey_categories").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("survey_questions").select("*").eq("is_active", true).order("sort_order"),
    ]);
    setCats((c ?? []) as unknown as SurveyCategory[]);
    setQuestions((q ?? []) as unknown as SurveyQuestion[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    void supabase
      .from("survey_responses")
      .select("category_id")
      .eq("user_id", userId)
      .then(({ data }) => {
        const map: Record<string, boolean> = {};
        (data ?? []).forEach((r: { category_id: string }) => (map[r.category_id] = true));
        setDone(map);
      });
  }, [userId]);

  const byCat = useMemo(() => {
    const m: Record<string, SurveyQuestion[]> = {};
    questions.forEach((q) => (m[q.category_id] = [...(m[q.category_id] ?? []), q]));
    return m;
  }, [questions]);

  const setAnswer = (catId: string, qId: string, v: AnswerValue) => {
    setDrafts((prev) => {
      const next = { ...prev, [catId]: { ...(prev[catId] ?? {}), [qId]: v } };
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
      return next;
    });
  };

  const submit = async (cat: SurveyCategory) => {
    const answers = drafts[cat.id] ?? {};
    const required = (byCat[cat.id] ?? []).filter((q) => q.is_required);
    const missing = required.find((q) => {
      const v = answers[q.id];
      return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
    });
    if (missing) {
      toast.error("Please answer: " + missing.prompt);
      return;
    }
    if (Object.keys(answers).length === 0) {
      toast.error("Nothing filled in yet.");
      return;
    }
    setSaving(true);
    try {
      if (userId) {
        const { data: existing } = await supabase
          .from("survey_responses")
          .select("id")
          .eq("category_id", cat.id)
          .eq("user_id", userId)
          .maybeSingle();
        if (existing?.id) {
          const { error } = await supabase
            .from("survey_responses")
            .update({ answers })
            .eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("survey_responses")
            .insert({ category_id: cat.id, user_id: userId, answers });
          if (error) throw error;
        }
      } else {
        const { error } = await supabase
          .from("survey_responses")
          .insert({ category_id: cat.id, session_token: sessionToken(), answers });
        if (error) throw error;
      }
      setDone((d) => ({ ...d, [cat.id]: true }));
      setOpenCat(null);
      toast.success("Thank you! Your answers were saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save your answers");
    } finally {
      setSaving(false);
    }
  };

  const current = cats.find((c) => c.id === openCat) ?? null;

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="container mx-auto max-w-4xl px-4 py-8">
        {!current ? (
          <>
            <header className="mb-6 space-y-2">
              <h1 className="font-display text-3xl text-foreground">Player Survey</h1>
              <p className="text-muted-foreground">
                Pick any topic you care about and answer it on its own. Each one takes a minute or two, and
                you can come back for the rest later.
              </p>
              {!userId && (
                <p className="text-sm text-muted-foreground">
                  You can answer without signing in. Signing in lets you change your answers later.
                </p>
              )}
            </header>

            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading…
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {cats.map((c) => {
                  const Icon = ICONS[c.icon] ?? Sparkles;
                  const started = Object.keys(drafts[c.id] ?? {}).length > 0;
                  const finished = done[c.id];
                  return (
                    <Card
                      key={c.id}
                      className="flex cursor-pointer flex-col gap-3 border-border/60 bg-card/60 p-5 transition hover:border-primary/60"
                      onClick={() => setOpenCat(c.id)}
                    >
                      <div className="flex items-start gap-3">
                        <span className="rounded-md bg-primary/15 p-2 text-primary">
                          <Icon className="size-5" />
                        </span>
                        <div className="min-w-0">
                          <h2 className="font-display text-lg text-foreground">{c.title}</h2>
                          <p className="text-sm text-muted-foreground">{c.description}</p>
                        </div>
                      </div>
                      <div className="mt-auto flex items-center justify-between">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            finished
                              ? "bg-primary/15 text-primary"
                              : started
                                ? "bg-amber-500/15 text-amber-500"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {finished ? "Completed" : started ? "In progress" : "Not started"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {(byCat[c.id] ?? []).length} questions
                        </span>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
            <Button variant="ghost" size="sm" className="mb-4" onClick={() => setOpenCat(null)}>
              <ArrowLeft className="size-4" /> All topics
            </Button>
            <header className="mb-6 space-y-1">
              <h1 className="font-display text-2xl text-foreground">{current.title}</h1>
              {current.intro && <p className="text-sm text-muted-foreground">{current.intro}</p>}
              {done[current.id] && (
                <p className="text-sm text-primary">
                  <Check className="mr-1 inline size-4" />
                  You already answered this. Saving again replaces your answers.
                </p>
              )}
            </header>

            <div className="space-y-5">
              {(byCat[current.id] ?? []).map((q) => {
                const value = (drafts[current.id] ?? {})[q.id];
                return (
                  <Card key={q.id} className="space-y-3 border-border/60 bg-card/60 p-5">
                    <div>
                      <p className="font-medium text-foreground">
                        {q.prompt}
                        {q.is_required && <span className="ml-1 text-destructive">*</span>}
                      </p>
                      {q.help_text && <p className="text-sm text-muted-foreground">{q.help_text}</p>}
                    </div>

                    {q.question_type === "stars" && (
                      <Stars
                        value={typeof value === "number" ? value : 0}
                        onChange={(n) => setAnswer(current.id, q.id, n)}
                      />
                    )}

                    {q.question_type === "open_text" && (
                      <Textarea
                        value={typeof value === "string" ? value : ""}
                        onChange={(e) => setAnswer(current.id, q.id, e.target.value)}
                        placeholder="Your answer…"
                        rows={3}
                      />
                    )}

                    {q.question_type === "single_choice" && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {asOptions(q.options).map((o) => {
                          const on = value === o.value;
                          const img = o.icon ? OPTION_IMAGES[o.icon] : undefined;
                          return (
                            <button
                              key={o.value}
                              type="button"
                              onClick={() => setAnswer(current.id, q.id, on ? null : o.value)}
                              className={`flex items-start gap-2 rounded-md border px-3 py-2 text-left text-sm transition ${
                                on
                                  ? "border-primary bg-primary/15 text-foreground"
                                  : "border-border/60 bg-background/40 text-muted-foreground hover:border-primary/50"
                              }`}
                            >
                              {img && <img src={img} alt="" className="mt-0.5 size-5 shrink-0" />}
                              <span className="min-w-0">
                                <span className="block">{o.label}</span>
                                {o.hint && (
                                  <span className="block text-xs text-muted-foreground">{o.hint}</span>
                                )}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {q.question_type === "multi_choice" && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {asOptions(q.options).map((o) => {
                          const arr = Array.isArray(value) ? (value as string[]) : [];
                          const on = arr.includes(o.value);
                          const img = o.icon ? OPTION_IMAGES[o.icon] : undefined;
                          return (
                            <button
                              key={o.value}
                              type="button"
                              onClick={() =>
                                setAnswer(
                                  current.id,
                                  q.id,
                                  on ? arr.filter((x) => x !== o.value) : [...arr, o.value],
                                )
                              }
                              className={`flex items-start gap-2 rounded-md border px-3 py-2 text-left text-sm transition ${
                                on
                                  ? "border-primary bg-primary/15 text-foreground"
                                  : "border-border/60 bg-background/40 text-muted-foreground hover:border-primary/50"
                              }`}
                            >
                              {img && <img src={img} alt="" className="mt-0.5 size-5 shrink-0" />}
                              <span className="min-w-0">
                                <span className="block">{o.label}</span>
                                {o.hint && (
                                  <span className="block text-xs text-muted-foreground">{o.hint}</span>
                                )}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {q.question_type === "single_choice" &&
                      asOptions(q.options).some((o) => o.builder && o.value === value) &&
                      (() => {
                        const fmt = (drafts[current.id] ?? {})[`${q.id}__format`];
                        return (
                          <div className="rounded-md border border-border/60 bg-background/40 p-3">
                            <p className="mb-2 text-sm text-muted-foreground">
                              Put together the one format everyone would play:
                            </p>
                            <SurveyFormatBuilder
                              max={1}
                              value={
                                Array.isArray(fmt) && typeof fmt[0] === "object"
                                  ? (fmt as FormatPick[])
                                  : [emptyFormat()]
                              }
                              onChange={(next) => setAnswer(current.id, `${q.id}__format`, next)}
                            />
                          </div>
                        );
                      })()}

                    {q.question_type === "format_builder" && (
                      <SurveyFormatBuilder
                        max={builderMax(q.options)}
                        value={Array.isArray(value) && typeof value[0] === "object" ? (value as FormatPick[]) : [emptyFormat()]}
                        onChange={(next) => setAnswer(current.id, q.id, next)}
                      />
                    )}
                  </Card>
                );
              })}
            </div>

            <div className="sticky bottom-0 mt-6 flex justify-end gap-2 border-t border-border/60 bg-background/90 py-4 backdrop-blur">
              <Button variant="outline" onClick={() => setOpenCat(null)}>
                Save for later
              </Button>
              <Button onClick={() => submit(current)} disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                Submit answers
              </Button>
            </div>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
