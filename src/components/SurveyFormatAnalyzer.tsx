import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import {
  BOARDS,
  MODULES,
  asOptions,
  formatLabel,
  type BoardKey,
  type FormatPick,
  type SurveyCategory,
  type SurveyQuestion,
} from "@/lib/survey";

type Row = { category_id: string; answers: Record<string, unknown> | null };
type FormatSource = { id: string; label: string; picks: FormatPick[] };

function isPick(p: unknown): p is FormatPick {
  return !!p && typeof p === "object" && "board" in p && Array.isArray((p as FormatPick).modules);
}

const pct = (n: number, t: number) => (t ? Math.round((n / t) * 100) : 0);

/** Interactive drill-down: pick sources, then a board, and see how often each module is on. */
export function FormatAnalyzer({
  cats,
  byCat,
  responses,
}: {
  cats: SurveyCategory[];
  byCat: Record<string, SurveyQuestion[]>;
  responses: Row[];
}) {
  const sources = useMemo<FormatSource[]>(() => {
    const out: FormatSource[] = [];
    cats.forEach((c) => {
      const rows = responses.filter((r) => r.category_id === c.id);
      (byCat[c.id] ?? []).forEach((q) => {
        if (q.question_type === "format_builder") {
          const picks = rows
            .flatMap((r) => {
              const v = r.answers?.[q.id];
              return Array.isArray(v) ? (v as unknown[]) : [];
            })
            .filter(isPick);
          out.push({ id: q.id, label: c.title, picks });
        }
        asOptions(q.options)
          .filter((o) => o.builder)
          .forEach((o) => {
            const picks = rows
              .filter((r) => r.answers?.[q.id] === o.value)
              .flatMap((r) => {
                const v = r.answers?.[`${q.id}__format`];
                return Array.isArray(v) ? (v as unknown[]) : [];
              })
              .filter(isPick);
            out.push({ id: `${q.id}:${o.value}`, label: `${c.title} · ${o.label}`, picks });
          });
      });
    });
    return out;
  }, [cats, byCat, responses]);

  const [selected, setSelected] = useState<string[] | null>(null);
  const [board, setBoard] = useState<BoardKey | null>(null);
  if (sources.length === 0) return null;

  const active = selected ?? sources.map((s) => s.id);
  const all = sources.filter((s) => active.includes(s.id)).flatMap((s) => s.picks);
  const boardCounts = BOARDS.map((b) => ({ ...b, n: all.filter((p) => p.board === b.key).length }));
  const scoped = board ? all.filter((p) => p.board === board) : all;
  const modules = MODULES.filter((m) => !board || m.boards.includes(board)).map((m) => {
    const eligible = scoped.filter((p) => m.boards.includes(p.board));
    return { m, on: eligible.filter((p) => p.modules.includes(m.key)).length, total: eligible.length };
  });
  const packages: Record<string, number> = {};
  scoped.forEach((p) => {
    const l = formatLabel(p);
    packages[l] = (packages[l] ?? 0) + 1;
  });
  const top = Object.entries(packages).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const toggle = (id: string) =>
    setSelected(active.includes(id) ? active.filter((x) => x !== id) : [...active, id]);

  return (
    <Card className="space-y-6 border-primary/30 bg-card/70 p-5">
      <div>
        <h2 className="font-display text-lg text-foreground">Game format analyzer</h2>
        <p className="text-sm text-muted-foreground">
          Combines every built format. Pick where answers come from, then click a board to drill in.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {sources.map((s) => {
          const on = active.includes(s.id);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => toggle(s.id)}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                on ? "border-primary bg-primary/15 text-foreground" : "border-border/60 text-muted-foreground hover:border-primary/50"
              }`}
            >
              {s.label} <span className="text-xs text-muted-foreground">({s.picks.length})</span>
            </button>
          );
        })}
      </div>

      {all.length === 0 ? (
        <p className="text-sm text-muted-foreground">No formats in the selected sources.</p>
      ) : (
        <>
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Board · {all.length} formats</p>
            <div className="flex h-12 overflow-hidden rounded-md border border-border/60">
              {boardCounts
                .filter((b) => b.n > 0)
                .map((b) => {
                  const on = board === b.key;
                  return (
                    <button
                      key={b.key}
                      type="button"
                      onClick={() => setBoard(on ? null : b.key)}
                      style={{ width: `${pct(b.n, all.length)}%` }}
                      className={`flex min-w-[6rem] items-center justify-center gap-2 border-r border-border/60 text-sm transition last:border-r-0 ${
                        on
                          ? "bg-primary text-primary-foreground"
                          : board
                            ? "bg-muted/40 text-muted-foreground"
                            : "bg-primary/20 text-foreground hover:bg-primary/30"
                      }`}
                    >
                      {b.image && <img src={b.image} alt="" className="size-5" />}
                      {b.label} {pct(b.n, all.length)}%
                    </button>
                  );
                })}
            </div>
            <p className="text-xs text-muted-foreground">
              {board ? "Showing only this board — click it again to show all." : "Click a board to see only formats with it."}
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Expansions & modules (on / off)</p>
            {modules.map(({ m, on, total }) => (
              <div key={m.key} className="grid grid-cols-[minmax(9rem,14rem)_1fr_7rem] items-center gap-3 text-sm">
                <span className="flex items-center gap-2 text-foreground">
                  {m.image ? <img src={m.image} alt="" className="size-5" /> : <span className="size-5" />}
                  {m.label}
                </span>
                <div className="flex h-3 overflow-hidden rounded bg-muted">
                  <div className="h-3 bg-primary" style={{ width: `${pct(on, total)}%` }} />
                </div>
                <span className="text-right text-xs tabular-nums text-muted-foreground">
                  {pct(on, total)}% on · {pct(total - on, total)}% off
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Top 5 complete formats</p>
            <ol className="space-y-1.5 text-sm">
              {top.map(([label, n], i) => (
                <li key={label} className="flex justify-between gap-3 rounded-md border border-border/50 bg-background/50 px-3 py-2">
                  <span className="text-foreground">
                    <span className="mr-2 text-primary">{i + 1}.</span>
                    {label}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {n} · {pct(n, scoped.length)}%
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </>
      )}
    </Card>
  );
}
