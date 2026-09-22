import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Users,
  Gamepad2,
  MessageSquare,
  Eye,
  EyeOff,
  Copy,
  Plus,
  ExternalLink,
  Loader2,
  Globe,
  Clock,
} from "lucide-react";
import asyncIcon from "@/assets/async-mode.png.asset.json";
import liveIcon from "@/assets/live-mode.png.asset.json";
import uprisingIcon from "@/assets/uprising.png.asset.json";
import ixIcon from "@/assets/ix.png.asset.json";
import immoIcon from "@/assets/immo.png.asset.json";
import epicIcon from "@/assets/epic.png.asset.json";

export const Route = createFileRoute("/lfg")({
  head: () => ({
    meta: [
      { title: "LFG hub · Strategy Arena" },
      {
        name: "description",
        content:
          "Find a Dune: Imperium group in seconds. Live and async lobbies from Discord and the web, with open seats, passwords and quick chat.",
      },
      { property: "og:title", content: "LFG hub · Strategy Arena" },
      {
        property: "og:description",
        content: "Open Dune: Imperium lobbies from Discord and the web — join a seat and play.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LfgPage,
});

export type LfgRow = {
  id: number;
  match_id: string | null;
  message_id: string;
  channel_id: string;
  guild_id: string;
  status: string;
  message_text: string;
  lobby_password: string | null;
  board_type: string | null;
  expansions: string[] | null;
  modules: string[] | null;
  created_at: string;
  expires_at: string | null;
  auto_start_at: string | null;
  mode: string | null;
  player_ids: string[] | null;
  guest_players: string[] | null;
  web_host_id: string | null;
  web_player_ids: string[] | null;
  web_player_names: string[] | null;
};

const SELECT_COLS =
  "id,match_id,message_id,channel_id,guild_id,status,message_text,lobby_password,board_type,expansions,modules,created_at,expires_at,auto_start_at,mode,player_ids,guest_players,web_host_id,web_player_ids,web_player_names";

const QUICK_CHATS = [
  { code: "room_up", emoji: "🎮", label: "Room is up!" },
  { code: "password_ask", emoji: "🔑", label: "What's the password?" },
  { code: "need_5", emoji: "⏳", label: "Need 5 mins" },
  { code: "ping", emoji: "📢", label: "Need 1 more" },
] as const;

const EXPANSION_OPTIONS = [
  { key: "Rise of IX", label: "Rise of Ix", icon: ixIcon.url },
  { key: "Epic Mode", label: "Epic Mode", icon: epicIcon.url },
  { key: "Immortality", label: "Immortality", icon: immoIcon.url },
  { key: "Base Leaders", label: "Base Leaders", icon: null },
] as const;

function isLive(r: LfgRow) {
  return (r.mode ?? "async").toLowerCase() === "live";
}

function hasExp(r: LfgRow, needle: string) {
  const all = [...(r.expansions ?? []), ...(r.modules ?? [])].join(" ").toLowerCase();
  return all.includes(needle);
}

type Seat = { name: string; web: boolean; discord: boolean };

function seatsOf(r: LfgRow, discordNames: Record<string, string>): Seat[] {
  const web = (r.web_player_names ?? []).map((n) => ({ name: n, web: true, discord: false }));
  const discord = (r.player_ids ?? []).map((id) => ({
    name: discordNames[id] ?? "Discord Player",
    web: false,
    discord: true,
  }));
  const guests = (r.guest_players ?? []).map((n) => ({ name: n, web: false, discord: false }));
  return [...web, ...discord, ...guests].slice(0, 4);
}

function isExpired(r: LfgRow, now: number) {
  return !r.expires_at || new Date(r.expires_at).getTime() <= now;
}

function useCountdown(target: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [target]);
  if (!target) return null;
  const diff = new Date(target).getTime() - now;
  if (diff <= 0) return "starting now";
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m ${String(s).padStart(2, "0")}s`;
}

function LfgPage() {
  const [rows, setRows] = useState<LfgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | "live" | "async">("all");
  const [userId, setUserId] = useState<string | null>(null);
  const [myIgn, setMyIgn] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [discordNames, setDiscordNames] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("active_async_matches")
      .select(SELECT_COLS)
      .eq("status", "searching")
      .order("created_at", { ascending: false });
    setRows((data as unknown as LfgRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("lfg-hub")
      .on("postgres_changes", { event: "*", schema: "public", table: "active_async_matches" }, () => {
        load();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  useEffect(() => {
    let active = true;
    const resolve = async (uid: string | null) => {
      if (!active) return;
      setUserId(uid);
      if (!uid) {
        setMyIgn(null);
        return;
      }
      const { data } = await supabase.rpc("lfg_my_ign");
      if (active) setMyIgn((data as string | null) ?? null);
    };
    supabase.auth.getSession().then(({ data }) => resolve(data.session?.user.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => resolve(s?.user.id ?? null));
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Resolve Discord user IDs to in-game names via player_discord_map
  useEffect(() => {
    const ids = [...new Set(rows.flatMap((r) => r.player_ids ?? []).filter(Boolean))];
    const missing = ids.filter((id) => !(id in discordNames));
    if (missing.length === 0) return;
    let active = true;
    supabase
      .from("player_discord_map")
      .select("discord_user_id,player_key,display_name")
      .in("discord_user_id", missing)
      .then(({ data }) => {
        if (!active || !data) return;
        setDiscordNames((prev) => {
          const next = { ...prev };
          for (const row of data) {
            if (row.discord_user_id) next[row.discord_user_id] = row.display_name ?? row.player_key ?? "Discord Player";
          }
          return next;
        });
      });
    return () => {
      active = false;
    };
  }, [rows, discordNames]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          !isExpired(r, now) && (tab === "all" ? true : tab === "live" ? isLive(r) : !isLive(r)),
      ),
    [rows, tab, now],
  );

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="container mx-auto px-4 py-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display text-gradient-sand">Looking for group</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {loading
                ? "Loading lobbies…"
                : `${rows.filter((r) => !isExpired(r, now)).length} open lobb${rows.filter((r) => !isExpired(r, now)).length === 1 ? "y" : "ies"} right now`}
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="size-4" />
            Create LFG
          </Button>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="all">All matches</TabsTrigger>
            <TabsTrigger value="live">Live matches</TabsTrigger>
            <TabsTrigger value="async">ASync matches</TabsTrigger>
          </TabsList>
        </Tabs>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <Card className="bg-card/70 border-border/60 shadow-arena p-10 text-center">
            <Users className="size-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No open lobbies here yet. Be the first to create one.</p>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((r) => (
              <LfgCard key={r.id} row={r} userId={userId} myIgn={myIgn} discordNames={discordNames} onChanged={load} />
            ))}
          </div>
        )}
      </main>
      <Footer />
      <CreateLfgDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        userId={userId}
        myIgn={myIgn}
        onCreated={load}
      />
    </div>
  );
}

function ExpansionBadge({ src, title }: { src: string; title: string }) {
  return (
    <span
      title={title}
      className="inline-flex size-7 items-center justify-center rounded-full border border-border/60 bg-background/60"
    >
      <img src={src} alt={title} className="size-4 object-contain" />
    </span>
  );
}

function LfgCard({
  row,
  userId,
  myIgn,
  discordNames,
  onChanged,
}: {
  row: LfgRow;
  userId: string | null;
  myIgn: string | null;
  discordNames: Record<string, string>;
  onChanged: () => void;
}) {
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const live = isLive(row);
  const seats = seatsOf(row, discordNames);
  const open = Math.max(0, 4 - seats.length);
  const countdown = useCountdown(row.auto_start_at);
  const seated = !!userId && (row.web_player_ids ?? []).includes(userId);
  const accent = live ? "var(--teal)" : "var(--coral)";

  // Tick every second so an active lobby flips to "Expired" the moment it lapses
  const [cardNow, setCardNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setCardNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const expired = isExpired(row, cardNow);

  const call = async (fn: "lfg_join_seat" | "lfg_start_game") => {
    setBusy(true);
    const { data, error } = await supabase.rpc(fn, { p_id: row.id });
    setBusy(false);
    const res = data as { ok?: boolean; error?: string } | null;
    if (error || !res?.ok) {
      toast.error(res?.error ?? error?.message ?? "Something went wrong");
      return;
    }
    toast.success(fn === "lfg_join_seat" ? "Seat taken" : "Game started");
    onChanged();
  };

  const quickChat = async (code: string, label: string) => {
    const { error } = await supabase.from("lobby_quick_chats").insert({
      lobby_id: row.id,
      sender_name: myIgn ?? "Web player",
      message_code: code,
    });
    if (error) toast.error(error.message);
    else toast.success(`Sent: ${label}`);
  };

  const discordUrl =
    row.guild_id && row.channel_id && row.message_id
      ? `https://discord.com/channels/${row.guild_id}/${row.channel_id}/${row.message_id}`
      : null;

  return (
    <Card className="bg-card/70 border-border/60 shadow-arena p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <img src={live ? liveIcon.url : asyncIcon.url} alt={live ? "Live" : "Async"} className="size-6 shrink-0" />
          <div className="min-w-0">
            <div className="font-display truncate">{row.match_id ?? `Lobby #${row.id}`}</div>
            <div className="text-xs uppercase tracking-wide" style={{ color: accent }}>
              {live ? "Live" : "ASync"} · {row.board_type?.replace(/<[^>]*>/g, "").trim() || "Not specified"}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          {(row.board_type ?? "").toLowerCase().includes("uprising") && (
            <ExpansionBadge src={uprisingIcon.url} title="Uprising" />
          )}
          {hasExp(row, "ix") && <ExpansionBadge src={ixIcon.url} title="Rise of Ix" />}
          {hasExp(row, "immo") && <ExpansionBadge src={immoIcon.url} title="Immortality" />}
          {hasExp(row, "epic") && <ExpansionBadge src={epicIcon.url} title="Epic Mode" />}
        </div>
      </div>

      {row.message_text?.trim() ? (
        <p className="text-sm text-muted-foreground line-clamp-2">{row.message_text.replace(/<[^>]*>/g, "").trim()}</p>
      ) : null}

      <div className="rounded-lg border border-border/60 bg-background/40 p-2 space-y-1.5">
        {Array.from({ length: 4 }).map((_, i) => {
          const seat = seats[i];
          return (
            <div
              key={i}
              className="flex items-center justify-between rounded-full border border-border/50 bg-card/60 px-3 py-1.5 text-sm"
            >
              {seat ? (
                <span className="flex items-center gap-2 truncate">
                  {seat.web && <Globe className="size-3.5 text-teal" />}
                  <span className="truncate">{seat.name}</span>
                </span>
              ) : (
                <span className="text-muted-foreground text-xs">Empty seat</span>
              )}
              {!seat && userId && !expired && (
                <button
                  disabled={busy}
                  onClick={() => call("lfg_join_seat")}
                  className="text-xs text-primary hover:underline disabled:opacity-50"
                >
                  [ + Join seat ]
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background/40 px-3 py-2">
        <span className="text-xs text-muted-foreground">Password</span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm">
            {row.lobby_password ? (reveal ? row.lobby_password : "••••••") : "None"}
          </span>
          {row.lobby_password && (
            <>
              <button onClick={() => setReveal((v) => !v)} aria-label="Reveal password">
                {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
              <button
                aria-label="Copy password"
                onClick={() => {
                  navigator.clipboard.writeText(row.lobby_password ?? "");
                  toast.success("Password copied");
                }}
              >
                <Copy className="size-4" />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="relative flex size-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ backgroundColor: accent }} />
          <span className="relative inline-flex size-2 rounded-full" style={{ backgroundColor: accent }} />
        </span>
        {countdown ? (
          <span className="flex items-center gap-1">
            <Clock className="size-3.5" /> Auto-start in {countdown}
          </span>
        ) : (
          <span>Waiting for players ({seats.length}/4)</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {discordUrl && (
          <Button asChild variant="outline" size="sm">
            <a href={discordUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" />
              Open in Discord
            </a>
          </Button>
        )}
        {seated && (
          <>
            <Button size="sm" disabled={busy} onClick={() => call("lfg_start_game")}>
              <Gamepad2 className="size-4" />
              Start game
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <MessageSquare className="size-4" />
                  Quick chat
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {QUICK_CHATS.map((q) => (
                  <DropdownMenuItem key={q.code} onClick={() => quickChat(q.code, q.label)}>
                    <span className="mr-2">{q.emoji}</span>
                    {q.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
        {open > 0 && !seated && (
          <span className="text-xs text-muted-foreground">
            {open} seat{open === 1 ? "" : "s"} open
          </span>
        )}
      </div>
    </Card>
  );
}

function CreateLfgDialog({
  open,
  onOpenChange,
  userId,
  myIgn,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string | null;
  myIgn: string | null;
  onCreated: () => void;
}) {
  const [mode, setMode] = useState<"live" | "async">("async");
  const [board, setBoard] = useState<"Uprising" | "Base Game">("Uprising");
  const [exps, setExps] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [password, setPassword] = useState("None");
  const [liveMinutes, setLiveMinutes] = useState(60);
  const [asyncHours, setAsyncHours] = useState(6);
  const [busy, setBusy] = useState(false);

  const toggleExp = (key: string) =>
    setExps((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const submit = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("lfg_create_lobby", {
      p_mode: mode,
      p_board: board,
      p_expansions: exps,
      p_notes: notes,
      p_password: password.trim().toLowerCase() === "none" ? "" : password,
      p_expires_minutes: mode === "live" ? liveMinutes : asyncHours * 60,
    });
    setBusy(false);
    const res = data as { ok?: boolean; error?: string } | null;
    if (error || !res?.ok) {
      toast.error(res?.error ?? error?.message ?? "Could not create the lobby");
      return;
    }
    toast.success("Lobby created — it goes live once the bot picks it up.");
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create an LFG lobby</DialogTitle>
          <DialogDescription>Your lobby is shared with web players and the Discord community.</DialogDescription>
        </DialogHeader>

        {!userId ? (
          <p className="text-sm text-destructive">Sign in to create a lobby.</p>
        ) : !myIgn ? (
          <p className="text-sm text-destructive">You must claim your in-game name to create a lobby.</p>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label>Mode</Label>
              <RadioGroup value={mode} onValueChange={(v) => setMode(v as typeof mode)} className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="live" />
                  <img src={liveIcon.url} alt="" className="size-4" /> Live (scheduled / instant)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="async" />
                  <img src={asyncIcon.url} alt="" className="size-4" /> ASync (turn-based)
                </label>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label>Board</Label>
              <RadioGroup value={board} onValueChange={(v) => setBoard(v as typeof board)} className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="Uprising" />
                  <img src={uprisingIcon.url} alt="" className="size-4" /> Uprising
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="Base Game" /> Base game
                </label>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label>Expansions</Label>
              <div className="grid grid-cols-2 gap-2">
                {EXPANSION_OPTIONS.map((e) => (
                  <label key={e.key} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={exps.includes(e.key)} onCheckedChange={() => toggleExp(e.key)} />
                    {e.icon && <img src={e.icon} alt="" className="size-4" />}
                    {e.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="lfg-notes">Notes</Label>
              <Input
                id="lfg-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="House rules, timing, anything else"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="lfg-pass">Password</Label>
              <Input id="lfg-pass" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>
                {mode === "live" ? `Expires in ${liveMinutes} minutes` : `Expires in ${asyncHours} hours`}
              </Label>
              {mode === "live" ? (
                <Slider min={5} max={180} step={5} value={[liveMinutes]} onValueChange={(v) => setLiveMinutes(v[0])} />
              ) : (
                <Slider min={1} max={24} step={1} value={[asyncHours]} onValueChange={(v) => setAsyncHours(v[0])} />
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !userId || !myIgn}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Create lobby
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
