import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ordinal, type TpEntry } from "@/lib/tournament-tp";

export function TpBreakdownButton({
  player,
  total,
  entries,
  bonus = 0,
}: {
  player: string;
  total: number;
  entries: TpEntry[];
  bonus?: number;
}) {
  const [open, setOpen] = useState(false);
  const sorted = [...entries].sort(
    (a, b) =>
      a.round.localeCompare(b.round, undefined, { numeric: true }) ||
      a.table.localeCompare(b.table, undefined, { numeric: true }),
  );
  const wins = entries.filter((e) => e.placement === 1).length;
  const avg = entries.length ? entries.reduce((s, e) => s + e.tp, 0) / entries.length : 0;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-mono text-sand underline decoration-dotted underline-offset-4 hover:decoration-solid"
        title="See how these TP were earned"
      >
        {total}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">
              {player} · <span className="text-sand">{total} TP</span>
            </DialogTitle>
            <DialogDescription>
              {entries.length} game{entries.length === 1 ? "" : "s"} counted · {wins} win{wins === 1 ? "" : "s"} ·{" "}
              {avg.toFixed(1)} TP per game{bonus ? ` · +${bonus} bye bonus` : ""}
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
            {sorted.length === 0 && <li className="text-sm text-muted-foreground italic">No finished games yet.</li>}
            {sorted.map((e) => (
              <li key={String(e.id)} className="rounded-md border border-border/50 bg-card/50 p-2 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="font-medium">
                    {e.round} · {e.table}
                  </span>
                  <span className="font-mono text-sand">{e.tp} TP</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {e.placement === 1
                    ? `1st with ${e.vp} VP, ${e.margin} ahead of 2nd → base 20 + ${e.margin} = ${e.tp}`
                    : `${ordinal(e.placement)} with ${e.vp} VP vs winner's ${e.winnerVp} → base ${e.base} − ${e.margin} = ${e.tp}`}
                </div>
              </li>
            ))}
            {bonus > 0 && (
              <li className="rounded-md border border-sand/50 bg-sand/10 p-2 text-sm flex justify-between">
                <span>Direct-to-Grand-Final bye bonus</span>
                <span className="font-mono text-sand">+{bonus} TP</span>
              </li>
            )}
          </ul>
          <p className="text-[11px] text-muted-foreground">
            Base points 20 / 15 / 10 / 5 by finish. The winner gains +1 per VP ahead of 2nd; everyone else loses 1 per
            VP behind the winner (never below 0).
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
