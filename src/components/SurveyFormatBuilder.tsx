import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, Lock } from "lucide-react";
import {
  BOARDS,
  MODULES,
  emptyFormat,
  formatLabel,
  moduleBlockedReason,
  normalizeFormat,
  type BoardKey,
  type FormatPick,
} from "@/lib/survey";

type Props = {
  value: FormatPick[];
  max: number;
  onChange: (next: FormatPick[]) => void;
};

/** Build up to `max` game setups, the same way an LFG lobby is created. */
export function SurveyFormatBuilder({ value, max, onChange }: Props) {
  const picks = value.length ? value : [emptyFormat()];

  const update = (i: number, patch: Partial<FormatPick>) => {
    const next = picks.map((p, idx) => (idx === i ? normalizeFormat({ ...p, ...patch }) : p));
    onChange(next);
  };

  const toggleModule = (i: number, key: string) => {
    const p = picks[i];
    const has = p.modules.includes(key);
    update(i, { modules: has ? p.modules.filter((m) => m !== key) : [...p.modules, key] });
  };

  return (
    <div className="space-y-4">
      {picks.map((pick, i) => (
        <Card key={i} className="space-y-4 border-border/60 bg-card/60 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-display text-sm uppercase tracking-wide text-primary">Format {i + 1}</p>
            {picks.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onChange(picks.filter((_, idx) => idx !== i))}
                aria-label={`Remove format ${i + 1}`}
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Board</p>
            <div className="flex flex-wrap gap-2">
              {BOARDS.map((b) => {
                const on = pick.board === b.key;
                return (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => update(i, { board: b.key as BoardKey })}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition ${
                      on
                        ? "border-primary bg-primary/15 text-foreground"
                        : "border-border/60 bg-background/40 text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {b.image && <img src={b.image} alt="" className="size-5" />}
                    <span>
                      {b.label}
                      <span className="block text-xs text-muted-foreground">{b.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Expansions & modules</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {MODULES.map((m) => {
                const blocked = moduleBlockedReason(m, pick);
                const on = pick.modules.includes(m.key);
                return (
                  <button
                    key={m.key}
                    type="button"
                    disabled={!!blocked}
                    title={blocked ?? m.hint}
                    onClick={() => toggleModule(i, m.key)}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition ${
                      blocked
                        ? "cursor-not-allowed border-border/40 bg-muted/20 text-muted-foreground/60"
                        : on
                          ? "border-primary bg-primary/15 text-foreground"
                          : "border-border/60 bg-background/40 text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {m.image ? <img src={m.image} alt="" className="size-5" /> : <span className="size-5" />}
                    <span className="min-w-0">
                      <span className="block truncate">{m.label}</span>
                      <span className="block text-xs text-muted-foreground">{blocked ?? m.hint}</span>
                    </span>
                    {blocked && <Lock className="ml-auto size-3.5 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
            {formatLabel(pick)}
          </p>
        </Card>
      ))}

      {picks.length < max && (
        <Button variant="outline" size="sm" onClick={() => onChange([...picks, emptyFormat()])}>
          <Plus className="size-4" />
          Add another format
        </Button>
      )}
    </div>
  );
}
