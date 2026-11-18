import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { reopenLobby } from "@/lib/lfg-history.functions";

export function ReopenLobbyButton({ id, onReopened }: { id: number; onReopened: () => void }) {
  const reopen = useServerFn(reopenLobby);
  const [busy, setBusy] = useState(false);
  return <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
    if (!confirm(`Reopen lobby #${id}? SP removed by the cancel is not restored automatically.`)) return;
    setBusy(true);
    try { const r = await reopen({ data: { lobbyId: id } }); toast.success(`Lobby reopened (${r.status})`); onReopened(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not reopen lobby"); }
    finally { setBusy(false); }
  }}><RotateCcw className="size-4" /> Reopen lobby</Button>;
}
