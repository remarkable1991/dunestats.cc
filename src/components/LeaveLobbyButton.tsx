import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { leaveLobby } from "@/lib/lobby-leave.functions";

export function LeaveLobbyButton({ id, onLeft }: { id: number; onLeft: () => void }) {
  const leave = useServerFn(leaveLobby);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await leave({ data: { id } });
      toast.success("You left the lobby");
      setOpen(false);
      onLeft();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not leave the lobby");
    } finally { setBusy(false); }
  };
  return <>
    <Button size="sm" variant="outline" onClick={() => setOpen(true)}><LogOut className="size-4" /> Leave Seat</Button>
    <Dialog open={open} onOpenChange={(next) => { if (!busy) setOpen(next); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leave lobby #{id}?</DialogTitle>
          <DialogDescription>Your website seat and linked Discord seat will be removed. Other players and guests stay in the lobby.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Stay in lobby</Button>
          <Button disabled={busy} onClick={() => void submit()}>{busy ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />} Leave Seat</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}