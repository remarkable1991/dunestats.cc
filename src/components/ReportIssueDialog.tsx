import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type Props = {
  matchId?: string | null;
  lobbyId?: string | number | null;
  label?: string;
  onReported?: () => void;
};

export function ReportIssueDialog({ matchId, lobbyId, label = "⚑ Report issue", onReported }: Props) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(matchId ?? "");
  const [lobby, setLobby] = useState(lobbyId != null ? String(lobbyId) : "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!code.trim() && !lobby.trim()) return toast.error("Enter a Match ID or Lobby #");
    if (reason.trim().length < 3) return toast.error("Please describe the issue");
    setBusy(true);
    const { data, error } = await supabase.rpc("submit_match_report", {
      p_public_match_id: code.trim() || undefined,
      p_lobby_id: lobby.trim() || undefined,
      p_reason: reason.trim(),
    });
    setBusy(false);
    const res = data as { ok?: boolean; error?: string } | null;
    if (error || res?.ok === false) {
      toast.error(error?.message ?? res?.error ?? "Could not send report");
      return;
    }
    toast.success("Thanks — moderators have been notified.");
    setReason("");
    setOpen(false);
    onReported?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs">{label}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report an issue</DialogTitle>
          <DialogDescription>Tell moderators what looks wrong. They'll follow up on Discord.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-xs">Match ID
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="STORM-BASIN-1234" />
            </label>
            <label className="grid gap-1 text-xs">Lobby #
              <Input value={lobby} onChange={(e) => setLobby(e.target.value)} placeholder="444" />
            </label>
          </div>
          <label className="grid gap-1 text-xs">What's wrong?
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} rows={4}
              placeholder="e.g. wrong leaders, wrong score, game never reported" />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Sending…" : "Send report"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
