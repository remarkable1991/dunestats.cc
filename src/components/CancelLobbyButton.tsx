import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cancelLobby } from "@/lib/lobby-cancel.functions";

export function CancelLobbyButton({ id, status, onCancelled }: { id: number; status: string; onCancelled: () => void }) {
  const cancel = useServerFn(cancelLobby);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!["pending_creation", "posting", "searching"].includes(status)) return null;
  const submit = async () => {
    setBusy(true);
    try {
      await cancel({ data: { id } });
      toast.success("Lobby cancelled");
      setOpen(false);
      onCancelled();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not cancel the lobby");
    } finally {
      setBusy(false);
    }
  };
  return <>
    <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setOpen(true)}><X className="size-4" /> Cancel lobby</Button>
    <Dialog open={open} onOpenChange={(next) => { if (!busy) setOpen(next); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel lobby #{id}?</DialogTitle>
          <DialogDescription>This closes the lobby and removes it from open LFG games. The player roster and activity history are kept.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Keep lobby</Button>
          <Button variant="destructive" disabled={busy} onClick={() => void submit()}>{busy ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />} Confirm cancellation</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}