import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cancelLobby, previewLobbyCancel, type SpPlan } from "@/lib/lobby-cancel.functions";

const LABEL: Record<string, string> = { match_start_base: "Game start", first_live_game: "Daily first game", first_weekly_async: "Weekly first async" };

export function SpPlanList({ plan }: { plan: SpPlan }) {
  if (!plan.lines.length) return <p className="text-sm text-muted-foreground">No SP was awarded for this game, so nothing changes.</p>;
  return <div className="space-y-2 text-sm">
    <ul className="divide-y divide-border rounded-md border border-border">
      {plan.lines.map((l, i) => <li key={i} className="flex items-center justify-between gap-2 px-3 py-1.5">
        <span><span className="font-medium">{l.player_key}</span> <span className="text-muted-foreground">· {LABEL[l.action_type] ?? l.action_type}</span></span>
        {l.moved_to_lobby
          ? <span className="text-xs text-primary">{l.amount} SP moves to lobby #{l.moved_to_lobby}</span>
          : <span className="text-xs text-destructive">−{l.amount} SP</span>}
      </li>)}
    </ul>
    <p className="text-xs text-muted-foreground">Total removed: {plan.sp_removed} SP. If a player's daily or weekly bonus came from this game and they played another game later that day/week, the bonus moves to that game instead of being lost.</p>
  </div>;
}

export function CancelLobbyButton({ id, status, linked, onCancelled }: { id: number; status: string; linked?: boolean; onCancelled: () => void }) {
  const cancel = useServerFn(cancelLobby);
  const preview = useServerFn(previewLobbyCancel);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<SpPlan | null>(null);
  const started = status === "started";
  useEffect(() => {
    if (!open || !started) return;
    setPlan(null);
    preview({ data: { id } }).then(setPlan).catch((e) => toast.error(e instanceof Error ? e.message : "Could not load SP impact"));
  }, [open, started, id, preview]);
  if (!(["pending_creation", "posting", "searching"].includes(status) || (started && !linked))) return null;
  const submit = async () => {
    setBusy(true);
    try {
      await cancel({ data: { id } });
      toast.success(started ? "Game cancelled and SP updated" : "Lobby cancelled");
      setOpen(false);
      onCancelled();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not cancel the lobby");
    } finally {
      setBusy(false);
    }
  };
  return <>
    <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setOpen(true)}><X className="size-4" /> {started ? "Cancel game" : "Cancel lobby"}</Button>
    <Dialog open={open} onOpenChange={(next) => { if (!busy) setOpen(next); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{started ? `Cancel started game #${id}?` : `Cancel lobby #${id}?`}</DialogTitle>
          <DialogDescription>{started
            ? "Use this when the game never really happened. The start SP below is removed. Roster and history are kept."
            : "This closes the lobby and removes it from open LFG games. The player roster and activity history are kept."}</DialogDescription>
        </DialogHeader>
        {started && (plan ? <SpPlanList plan={plan} /> : <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Checking SP…</div>)}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Keep {started ? "game" : "lobby"}</Button>
          <Button variant="destructive" disabled={busy || (started && !plan)} onClick={() => void submit()}>{busy ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />} Confirm cancellation</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
