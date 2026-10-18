import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useRoles } from "@/hooks/use-roles";
import { listConsolidationAccounts, consolidatePlayerRecords } from "@/lib/account-consolidation.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export function AccountConsolidation({ target, name }: { target: string | null; name: string }) {
  const { isAdmin } = useRoles();
  const lookup = useServerFn(listConsolidationAccounts);
  const merge = useServerFn(consolidatePlayerRecords);
  const [search, setSearch] = useState("");
  const [accounts, setAccounts] = useState<{ id: string; username: string | null; discord_username: string | null }[]>([]);
  const [source, setSource] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!isAdmin || !target) return null;
  const find = async () => {
    setBusy(true);
    try { setAccounts((await lookup({ data: { search } })).filter((a) => a.id !== target)); setSource(""); setConfirmed(false); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not search accounts"); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (!source || !confirmed) return;
    setBusy(true);
    try {
      await merge({ data: { source, target, confirmed: true } });
      toast.success("Player records transferred. Sign-in accounts remain separate.");
      setSource(""); setConfirmed(false); setAccounts([]);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not transfer records"); }
    finally { setBusy(false); }
  };
  return <Card className="mb-8 p-4 space-y-3 border-border">
    <h2 className="font-display text-lg">Duplicate account review</h2>
    <p className="text-sm text-muted-foreground">Keep {name}'s claimed account. Transfer claimed names, SP ownership and tournament registrations from another account. Sign-ins, permissions and other account data remain separate.</p>
    <div className="flex gap-2"><Input aria-label="Find duplicate account" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Account or Discord name" /><Button variant="outline" onClick={find} disabled={busy || search.trim().length < 2}>Search</Button></div>
    {accounts.length > 0 && <Select value={source} onValueChange={(id) => { setSource(id); setConfirmed(false); }}><SelectTrigger><SelectValue placeholder="Select source account" /></SelectTrigger><SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.username || "Unnamed account"}{a.discord_username ? ` · @${a.discord_username}` : ""} · {a.id.slice(0, 8)}</SelectItem>)}</SelectContent></Select>}
    {source && <><label className="flex items-center gap-2 text-sm"><Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} />I verified both accounts belong to the same person.</label><Button onClick={save} disabled={busy || !confirmed}>Transfer player records</Button></>}
  </Card>;
}