import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle2, GitMerge, Loader2, Pencil, Plus, Search, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Reg = {
  id: string;
  user_id: string | null;
  direwolf_name: string;
  discord_username: string | null;
  email: string | null;
  availability: unknown;
  has_checked_in: boolean | null;
  check_in_method: string | null;
  created_at: string;
};

const slotsOf = (r: Reg) =>
  Array.isArray(r.availability) ? (r.availability as unknown[]).filter((x): x is string => typeof x === "string") : [];

/** Group 30-minute slot timestamps into readable day → time-range lines. */
function summarizeAvailability(isos: string[]): string[] {
  const times = isos.map((s) => new Date(s)).filter((d) => !Number.isNaN(d.getTime())).sort((a, b) => a.getTime() - b.getTime());
  const byDay = new Map<string, number[]>();
  for (const d of times) {
    const key = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
    byDay.set(key, [...(byDay.get(key) ?? []), d.getTime()]);
  }
  const fmt = (t: number) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  const lines: string[] = [];
  for (const [day, arr] of byDay) {
    const ranges: string[] = [];
    let start = arr[0]!;
    let prev = arr[0]!;
    for (let i = 1; i <= arr.length; i++) {
      const cur = arr[i];
      if (cur == null || cur - prev > 30 * 60_000) {
        ranges.push(`${fmt(start)}–${fmt(prev + 30 * 60_000)}`);
        start = cur ?? start;
      }
      prev = cur ?? prev;
    }
    lines.push(`${day}: ${ranges.join(", ")}`);
  }
  return lines;
}

type Draft = { id: string | null; direwolf_name: string; discord_username: string; email: string; has_checked_in: boolean };

/** Admin tool: search, edit, add, delete and merge registrations for one tournament. */
export function RegistrationManager({ tournamentNum }: { tournamentNum: number }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Reg[] | null>(null);
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [mergeFrom, setMergeFrom] = useState<Reg | null>(null);
  const [mergeInto, setMergeInto] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from("tournament_registrations")
      .select("id, user_id, direwolf_name, discord_username, email, availability, has_checked_in, check_in_method, created_at")
      .eq("tournament_num", tournamentNum)
      .order("created_at", { ascending: true });
    if (error) {
      toast.error(error.message);
      setRows([]);
      return;
    }
    setRows((data ?? []) as Reg[]);
  };

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && rows === null) await load();
  };

  // Names / Discord handles used by more than one registration
  const dupKeys = useMemo(() => {
    const count = new Map<string, number>();
    for (const r of rows ?? []) {
      for (const k of [`n:${r.direwolf_name.trim().toLowerCase()}`, r.discord_username ? `d:${r.discord_username.trim().toLowerCase()}` : ""]) {
        if (k) count.set(k, (count.get(k) ?? 0) + 1);
      }
    }
    return count;
  }, [rows]);
  const isDup = (r: Reg) =>
    (dupKeys.get(`n:${r.direwolf_name.trim().toLowerCase()}`) ?? 0) > 1 ||
    (!!r.discord_username && (dupKeys.get(`d:${r.discord_username.trim().toLowerCase()}`) ?? 0) > 1);

  const filtered = (rows ?? []).filter((r) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return [r.direwolf_name, r.discord_username, r.email].some((v) => (v ?? "").toLowerCase().includes(s));
  });

  const save = async () => {
    if (!edit) return;
    if (!edit.direwolf_name.trim()) return toast.error("In-game name is required");
    setBusy(true);
    const base = {
      direwolf_name: edit.direwolf_name.trim(),
      discord_username: edit.discord_username.trim(),
      email: edit.email.trim() || null,
      has_checked_in: edit.has_checked_in,
      updated_at: new Date().toISOString(),
    };
    const prev = rows?.find((r) => r.id === edit.id);
    const checkin =
      edit.has_checked_in && !prev?.has_checked_in
        ? { check_in_method: "admin", checked_in_at: new Date().toISOString() }
        : !edit.has_checked_in
          ? { check_in_method: null, checked_in_at: null }
          : {};
    const { error } = edit.id
      ? await supabase.from("tournament_registrations").update({ ...base, ...checkin }).eq("id", edit.id)
      : await supabase.from("tournament_registrations").insert({
          ...base,
          ...checkin,
          tournament_num: tournamentNum,
          user_id: null,
          availability: [],
          consents: {},
          owns_expansions: true,
          active_on_discord: true,
        });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(edit.id ? "Registration updated" : "Player added");
    setEdit(null);
    await load();
  };

  const remove = async (r: Reg) => {
    if (!confirm(`Delete the registration of ${r.direwolf_name}? This cannot be undone.`)) return;
    const { error } = await supabase.from("tournament_registrations").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Registration deleted");
    await load();
  };

  const merge = async () => {
    const master = rows?.find((r) => r.id === mergeInto);
    if (!mergeFrom || !master) return;
    setBusy(true);
    const union = Array.from(new Set([...slotsOf(master), ...slotsOf(mergeFrom)])).sort();
    const { error: upErr } = await supabase
      .from("tournament_registrations")
      .update({
        availability: union,
        discord_username: master.discord_username || mergeFrom.discord_username || "",
        email: master.email || mergeFrom.email,
        user_id: master.user_id ?? mergeFrom.user_id,
        has_checked_in: !!(master.has_checked_in || mergeFrom.has_checked_in),
        updated_at: new Date().toISOString(),
      })
      .eq("id", master.id);
    if (upErr) {
      setBusy(false);
      return toast.error(upErr.message);
    }
    const { error: delErr } = await supabase.from("tournament_registrations").delete().eq("id", mergeFrom.id);
    setBusy(false);
    if (delErr) return toast.error(delErr.message);
    toast.success(`Merged into ${master.direwolf_name}`);
    setMergeFrom(null);
    setMergeInto("");
    await load();
  };

  return (
    <div className="pt-1">
      <button type="button" onClick={() => void toggle()} className="text-xs text-sand underline underline-offset-2 hover:text-sand/80">
        {rows ? `${rows.length} registered player${rows.length === 1 ? "" : "s"} · manage` : "Manage registrations"}
      </button>
      {open && rows === null && <Loader2 className="mt-2 size-4 animate-spin text-sand" />}
      {open && rows !== null && (
        <div className="mt-3 space-y-3 rounded-lg border border-border bg-card/50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, Discord or email" className="h-8 pl-7 text-sm" />
            </div>
            <Button size="sm" variant="outline" className="gap-1"
              onClick={() => setEdit({ id: null, direwolf_name: "", discord_username: "", email: "", has_checked_in: false })}>
              <Plus className="size-3.5" /> Add player
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            {rows.filter((r) => r.has_checked_in).length} checked in · {rows.filter(isDup).length} possible duplicates
          </div>
          {filtered.length === 0 && <div className="text-xs text-muted-foreground">No registrations found.</div>}
          <div className="divide-y divide-border">
            {filtered.map((r) => {
              const slots = slotsOf(r);
              const isOpen = expanded === r.id;
              return (
                <div key={r.id} className="py-2">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <button type="button" onClick={() => setExpanded(isOpen ? null : r.id)}
                      className="text-sm font-medium text-foreground hover:text-sand hover:underline underline-offset-2">
                      {r.direwolf_name}
                    </button>
                    {r.discord_username && <span className="text-xs text-muted-foreground">@{r.discord_username}</span>}
                    {r.user_id ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><User className="size-3" /> account</span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">guest</span>
                    )}
                    <span className="text-xs text-muted-foreground">· {(slots.length * 0.5).toFixed(1)}h</span>
                    {r.has_checked_in && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-primary"><CheckCircle2 className="size-3" /> checked in</span>
                    )}
                    {isDup(r) && (
                      <span className="rounded-full border border-destructive/50 bg-destructive/10 px-1.5 text-[10px] text-destructive">duplicate?</span>
                    )}
                    <div className="ml-auto flex gap-1">
                      <Button size="icon" variant="ghost" className="size-7" title="Edit"
                        onClick={() => setEdit({ id: r.id, direwolf_name: r.direwolf_name, discord_username: r.discord_username ?? "", email: r.email ?? "", has_checked_in: !!r.has_checked_in })}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="size-7" title="Merge into another registration"
                        onClick={() => { setMergeFrom(r); setMergeInto(""); }}>
                        <GitMerge className="size-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="size-7 text-destructive" title="Delete" onClick={() => void remove(r)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  {r.email && <div className="text-[11px] text-muted-foreground">{r.email}</div>}
                  {isOpen && (
                    <div className="ml-1 mt-1 space-y-0.5 border-l-2 border-sand/30 pl-3">
                      {slots.length === 0 && <div className="text-xs text-muted-foreground">No availability selected.</div>}
                      {summarizeAvailability(slots).map((line) => (
                        <div key={line} className="text-xs text-muted-foreground">{line}</div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{edit?.id ? "Edit registration" : "Add player"}</DialogTitle>
            <DialogDescription>
              {edit?.id ? "Changes apply to this tournament only." : "Adds a player without availability; they can fill it in by registering with the same name."}
            </DialogDescription>
          </DialogHeader>
          {edit && (
            <div className="space-y-3">
              <div><Label className="text-xs">In-game name</Label>
                <Input value={edit.direwolf_name} onChange={(e) => setEdit({ ...edit, direwolf_name: e.target.value })} /></div>
              <div><Label className="text-xs">Discord</Label>
                <Input value={edit.discord_username} onChange={(e) => setEdit({ ...edit, discord_username: e.target.value })} /></div>
              <div><Label className="text-xs">Email</Label>
                <Input type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></div>
              <label className="flex items-center justify-between text-sm">
                Checked in
                <Switch checked={edit.has_checked_in} onCheckedChange={(v) => setEdit({ ...edit, has_checked_in: v })} />
              </label>
              <Button className="w-full" disabled={busy} onClick={() => void save()}>
                {busy && <Loader2 className="size-4 animate-spin" />} Save
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!mergeFrom} onOpenChange={(v) => !v && setMergeFrom(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Merge {mergeFrom?.direwolf_name}</DialogTitle>
            <DialogDescription>
              Pick the registration to keep. Availability is combined, missing Discord/email/account are filled in from this one, and this registration is then deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {(rows ?? []).filter((r) => r.id !== mergeFrom?.id).map((r) => (
              <button key={r.id} type="button" onClick={() => setMergeInto(r.id)}
                className={`w-full rounded-md border px-3 py-2 text-left text-sm ${mergeInto === r.id ? "border-sand bg-sand/10" : "border-border hover:bg-muted/40"}`}>
                <span className="font-medium">{r.direwolf_name}</span>
                {r.discord_username && <span className="ml-2 text-xs text-muted-foreground">@{r.discord_username}</span>}
                {isDup(r) && <span className="ml-2 text-[10px] text-destructive">duplicate?</span>}
              </button>
            ))}
          </div>
          <Button className="w-full gap-1" disabled={!mergeInto || busy} onClick={() => void merge()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <GitMerge className="size-4" />} Merge and delete duplicate
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
