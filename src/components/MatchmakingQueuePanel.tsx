import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Users } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import liveIcon from "@/assets/live-mode.png.asset.json";
import asyncIcon from "@/assets/async-mode.png.asset.json";
import uprisingIcon from "@/assets/uprising.png.asset.json";
import ixIcon from "@/assets/ix.png.asset.json";
import immoIcon from "@/assets/immo.png.asset.json";
import choamIcon from "@/assets/choam.png.asset.json";
import epicIcon from "@/assets/epic.png.asset.json";

const MODE_ICON = { live: liveIcon.url, async: asyncIcon.url } as const;
function iconFor(name: string): string | null {
  const n = name.toLowerCase();
  if (n.includes("uprising")) return uprisingIcon.url;
  if (n.includes("ix")) return ixIcon.url;
  if (n.includes("immortal")) return immoIcon.url;
  if (n.includes("choam")) return choamIcon.url;
  if (n.includes("epic")) return epicIcon.url;
  return null;
}
function FormatLine({ label, p }: { label: string; p: Preset }) {
  const parts = [p.board_type, ...(p.expansions ?? [])];
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-muted-foreground w-14">{label}</span>
      <span className="font-medium text-foreground">{p.name}</span>
      {parts.map((x) => {
        const ic = iconFor(x);
        return (
          <Badge key={x} variant="secondary" className="gap-1">
            {ic && <img src={ic} alt="" className="size-4 object-contain" />}
            {x}
          </Badge>
        );
      })}
      <span className="text-muted-foreground">
        {label === "Now" ? `until ${new Date(p.end_date).toLocaleDateString()}` : `from ${new Date(p.start_date).toLocaleDateString()}`}
      </span>
    </div>
  );
}

type QueueRow = {
  id: string;
  mode: string;
  user_id: string | null;
  player_key: string | null;
  display_name: string | null;
  discord_user_id: string | null;
  expires_at: string | null;
};
type Preset = { id: number; name: string; board_type: string; expansions: string[] | null; start_date: string; end_date: string };

const DURATIONS = {
  live: [5, 15, 30, 45, 60].map((m) => ({ m, label: `${m} min` })),
  async: [1, 2, 6, 12].map((h) => ({ m: h * 60, label: `${h} h` })),
} as const;

function left(iso: string | null, now: number) {
  if (!iso) return "";
  const s = Math.max(0, Math.floor((new Date(iso).getTime() - now) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}:${String(sec).padStart(2, "0")}`;
}

/** LFG-admin-only pilot: league pre-lobby queue for Live and ASync. */
export function MatchmakingQueuePanel({ userId, myIgn }: { userId: string | null; myIgn: string | null }) {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [preset, setPreset] = useState<Preset | null>(null);
  const [nextPreset, setNextPreset] = useState<Preset | null>(null);
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [dur, setDur] = useState<{ live: number; async: number }>({ live: 45, async: 360 });
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("matchmaking_queue")
      .select("id,mode,user_id,player_key,display_name,discord_user_id,expires_at")
      .order("joined_at");
    setRows((data ?? []) as QueueRow[]);
  }, []);

  useEffect(() => {
    void load();
    const iso = new Date().toISOString();
    void supabase
      .from("league_presets")
      .select("id,name,board_type,expansions,start_date,end_date")
      .gt("end_date", iso)
      .order("start_date", { ascending: true })
      .order("id", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        const list = (data ?? []) as Preset[];
        const now = Date.now();
        const cur = list
          .filter((p) => new Date(p.start_date).getTime() <= now)
          .sort((a, b) => b.start_date.localeCompare(a.start_date) || b.id - a.id)[0] ?? null;
        setPreset(cur);
        setNextPreset(list.find((p) => new Date(p.start_date).getTime() > now) ?? null);
      });
    const ch = supabase
      .channel("mm-queue")
      .on("postgres_changes", { event: "*", schema: "public", table: "matchmaking_queue" }, () => void load())
      .subscribe();
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(t);
    };
  }, [load]);

  const active = rows.filter((r) => !r.expires_at || new Date(r.expires_at).getTime() > now);
  const myKey = myIgn?.trim().toLowerCase() ?? null;
  const isMine = (r: QueueRow) => (!!userId && r.user_id === userId) || (!!myKey && r.player_key === myKey);

  const join = async (mode: "live" | "async") => {
    setBusy(mode);
    const { data, error } = await supabase.rpc("mm_join_queue" as never, { p_mode: mode, p_duration_minutes: dur[mode] } as never);
    setBusy(null);
    if (error) return toast.error(error.message);
    const res = data as { linked_discord?: boolean; seated?: boolean; lobby_id?: number; created?: boolean } | null;
    const linked = res?.linked_discord;
    if (res?.seated && res.lobby_id) {
      toast.success(res.created ? `4/4 reached — League table #${res.lobby_id} created` : `Seat taken in League table #${res.lobby_id}`);
      void navigate({ to: "/lfg/$id", params: { id: String(res.lobby_id) } });
      return;
    }
    toast.success(`Joined the ${mode === "live" ? "Live" : "ASync"} queue${linked ? "" : " (no linked Discord yet)"}`);
    void load();
  };
  const leave = async (mode: string) => {
    setBusy(mode);
    const { error } = await supabase.rpc("mm_leave_queue" as never, { p_mode: mode } as never);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Left the queue");
    void load();
  };

  return (
    <Card className="p-4 space-y-4 border-primary/40">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-lg">League queue</h2>
          <Badge variant="outline">Admin pilot</Badge>
        </div>
      </div>
      <div className="space-y-1.5">
        {preset ? <FormatLine label="Now" p={preset} /> : <p className="text-xs text-muted-foreground">No active league format</p>}
        {nextPreset && <FormatLine label="Next" p={nextPreset} />}
      </div>
      <p className="text-xs text-muted-foreground">If an open League table for your mode has a seat, joining puts you straight in it.</p>
      {!myIgn && <p className="text-sm text-destructive">Claim your in-game name first to join a queue.</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {(["live", "async"] as const).map((mode) => {
          const list = active.filter((r) => r.mode === mode);
          const mine = list.find(isMine);
          return (
            <div key={mode} className="rounded-md border border-border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-medium"><img src={MODE_ICON[mode]} alt="" className="size-5 object-contain" />{mode === "live" ? "Live" : "ASync"}</span>
                <span className="flex items-center gap-1 text-sm text-muted-foreground"><Users className="size-4" />{list.length}/4</span>
              </div>
              <ul className="space-y-1 text-sm min-h-6">
                {list.length === 0 && <li className="text-muted-foreground">Nobody waiting yet</li>}
                {list.map((r) => (
                  <li key={r.id} className="flex justify-between gap-2">
                    <span className={isMine(r) ? "text-primary font-medium" : ""}>
                      {r.display_name ?? r.player_key ?? "Discord player"}
                      {r.discord_user_id && <span className="ml-1 text-xs text-muted-foreground">· Discord</span>}
                    </span>
                    <span className="tabular-nums text-muted-foreground">{left(r.expires_at, now)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-1">
                {DURATIONS[mode].map((d) => (
                  <Button key={d.m} size="sm" variant={dur[mode] === d.m ? "default" : "outline"}
                    onClick={() => setDur((s) => ({ ...s, [mode]: d.m }))}>{d.label}</Button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button size="sm" disabled={!myIgn || busy === mode} onClick={() => void join(mode)}>
                  {busy === mode && <Loader2 className="size-4 animate-spin" />}
                  {mine ? "Restart timer" : "Join queue"}
                </Button>
                {mine && <Button size="sm" variant="outline" disabled={busy === mode} onClick={() => void leave(mode)}>Leave</Button>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
