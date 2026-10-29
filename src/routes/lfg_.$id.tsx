import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { applyLeagueElo } from "@/lib/league-lobby-detect";
import { LobbyResultUpload } from "@/components/LobbyResultUpload";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { loadLobbyIdentities } from "@/lib/lfg-identity-loader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Globe, UserMinus, Link2, Loader2, Upload, Users, Trophy, Clock } from "lucide-react";
import { usePlayerTitles, colorForKey } from "@/lib/player-title";
import { type LfgRow, SELECT_COLS, UNKNOWN_NAME, leagueKey, seatsOf, isMember, isHost, type Seat } from "@/lib/lfg-seats";
import { LobbyPasswordRow } from "@/components/LobbyPasswordRow";
import { LobbyFormatIcons } from "@/components/LobbyFormatIcons";
import { CancelLobbyButton } from "@/components/CancelLobbyButton";
import { LeaveLobbyButton } from "@/components/LeaveLobbyButton";
import { LobbyStartControls } from "@/components/LobbyStartControls";
import { canLeaveLobby } from "@/lib/lobby-leave";
import liveIcon from "@/assets/live-mode.png.asset.json";
import asyncIcon from "@/assets/async-mode.png.asset.json";

export const Route = createFileRoute("/lfg_/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Lobby #${params.id} · Strategy Arena LFG` },
      { name: "description", content: "Lobby details: roster, activity, result upload and player links for this Dune: Imperium game." },
      { property: "og:title", content: `Lobby #${params.id} · Strategy Arena LFG` },
      { property: "og:description", content: "See who is in this Dune: Imperium lobby and report its result." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LobbyPage,
});

type Chat = { id: string; sender_name: string; message_code: string; created_at: string | null };
type LobbyEvent = { id: string; actor_name: string | null; kind: string; detail: string; created_at: string };
const CHAT_LABEL: Record<string, string> = {
  room_up: "🎮 Room is up!",
  password_ask: "🔑 What's the password?",
  need_5: "⏳ Need 5 mins",
  lobby_name_ask: "📛 What is the lobby name?",
  ign_ask: "🙋 What is your in-game name?",
  ping: "📣 Pinged the LFG role",
  start_3p_ask: "🎮 Start with three players?",
  agree_3p: "✅ Agreed to start with three players",
};

function fmt(ts: string | null | undefined) {
  return ts ? new Date(ts).toLocaleString() : "—";
}

function LobbyPage() {
  const { id } = Route.useParams();
  const titles = usePlayerTitles();
  const navigate = useNavigate();
  const [row, setRow] = useState<LfgRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [chats, setChats] = useState<Chat[]>([]);
  const [discordNames, setDiscordNames] = useState<Record<string, string>>({});
  const [discordKeys, setDiscordKeys] = useState<Record<string, string>>({});
  const [discordHandles, setDiscordHandles] = useState<Record<string, string>>({});
  const [discordVerified, setDiscordVerified] = useState<Record<string, boolean>>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [myIgn, setMyIgn] = useState<string | null>(null);
  const [myDiscordId, setMyDiscordId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [linkCode, setLinkCode] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkedCode, setLinkedCode] = useState<string | null>(null);
  const [addName, setAddName] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [events, setEvents] = useState<LobbyEvent[]>([]);

  const load = useCallback(async () => {
    const lobbyId = Number(id);
    const [{ data }, { data: chatRows }, { data: eventRows }] = await Promise.all([
      supabase.from("active_async_matches").select(SELECT_COLS).eq("id", lobbyId).maybeSingle(),
      supabase.from("lobby_quick_chats").select("id,sender_name,message_code,created_at").eq("lobby_id", lobbyId).order("created_at", { ascending: true }),
      supabase.from("lfg_lobby_events" as never).select("id,actor_name,kind,detail,created_at").eq("lobby_id", lobbyId).order("created_at", { ascending: true }),
    ]);
    const r = (data as unknown as LfgRow) ?? null;
    setRow(r);
    setChats((chatRows as Chat[]) ?? []);
    setEvents((eventRows as unknown as LobbyEvent[]) ?? []);
    setLoading(false);
    if (r) {
      const ids = [...new Set([...(r.player_ids ?? []), r.host_id].filter(Boolean))];
      if (ids.length) {
        const identities = await loadLobbyIdentities(ids);
        setDiscordNames(identities.names);
        setDiscordKeys(identities.keys);
        setDiscordHandles(identities.handles);
        setDiscordVerified(identities.verified);
      }
      if (r.linked_game_id) {
        const { data: g } = await supabase.from("games").select("public_match_id").eq("id", r.linked_game_id).maybeSingle();
        setLinkedCode(g?.public_match_id ?? r.linked_game_id);
      } else setLinkedCode(null);
    }
  }, [id]);

  useEffect(() => {
    void load();
    const ch = supabase
      .channel(`lfg-lobby-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "active_async_matches", filter: `id=eq.${id}` }, () => void load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "lobby_quick_chats", filter: `lobby_id=eq.${id}` }, () => void load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "lfg_lobby_events", filter: `lobby_id=eq.${id}` }, () => void load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id, load]);

  useEffect(() => {
    let active = true;
    const resolve = async (uid: string | null) => {
      setUserId(uid);
      if (!uid) {
        setMyIgn(null);
        setMyDiscordId(null);
        setIsAdmin(false);
        return;
      }
      const [{ data: ign }, { data: link }, { data: roles }] = await Promise.all([
        supabase.rpc("lfg_my_ign"),
        supabase.from("player_discord_map").select("discord_user_id").eq("claimed_by", uid).not("discord_user_id", "is", null).limit(1).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", uid),
      ]);
      if (!active) return;
      setMyIgn((ign as string | null) ?? null);
      setMyDiscordId(link?.discord_user_id ?? null);
      setIsAdmin((roles ?? []).some((r) => r.role === "admin" || (r.role as string) === "lfg_admin"));
    };
    supabase.auth.getSession().then(({ data }) => resolve(data.session?.user.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => resolve(s?.user.id ?? null));
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const seats = useMemo(() => (row ? seatsOf(row, discordNames, discordKeys, discordHandles, discordVerified) : []), [row, discordNames, discordKeys, discordHandles, discordVerified]);
  const me = { userId, discordId: myDiscordId, ign: myIgn };
  const member = row ? isMember(row, seats, me) : false;
  const canReport = member || isAdmin;
  const canManage = row ? isHost(row, seats, me) || isAdmin : false;
  const canUpload = !!row && canReport && !linkedCode && (seats.length >= 4 || row.status === "started");


  const removeSeat = async (seat: Seat) => {
    if (!row || seat.host) return;
    if (!confirm(`Remove ${seat.name} from this lobby?`)) return;
    const removedWeb = seat.webUserId ? [seat.webUserId] : [];
    const removedDiscord = seat.discordId ? [seat.discordId] : [];
    const k = seat.name.trim().toLowerCase();
    const guests = (row.guest_players ?? []).filter((g) => g.trim().toLowerCase() !== k && leagueKey(g) !== seat.playerKey);
    const { data, error } = await supabase.rpc("lfg_update_lobby", {
      p_id: row.id,
      p_mode: row.mode ?? "",
      p_board: row.board_type ?? "",
      p_expansions: row.expansions ?? [],
      p_notes: row.message_text ?? "",
      p_password: row.lobby_password ?? "",
      p_expires_minutes: 0,
      p_guest_players: guests,
      p_remove_web_ids: removedWeb,
      p_remove_discord_ids: removedDiscord,
    });
    const res = data as { ok?: boolean; error?: string } | null;
    if (error || !res?.ok) return toast.error(res?.error ?? error?.message ?? "Could not remove that player");
    toast.success(`${seat.name} removed from the lobby`);
    void load();
  };

  useEffect(() => {
    if (!row?.is_league || !isAdmin) return;
    const season = row.season_num ?? row.season_id;
    const keys = seats.flatMap((s) => (s.playerKey ? [s.playerKey] : []));
    if (!season || !keys.length) return;
    supabase
      .from("player_league_ratings")
      .select("player_key,elo")
      .eq("season", season)
      .in("player_key", keys)
      .then(({ data }) => {
        const next: Record<string, number> = {};
        for (const r of data ?? []) next[leagueKey(r.player_key)] = Number(r.elo);
        setRatings(next);
      });
  }, [row, seats, isAdmin]);

  const addPlayer = async () => {
    if (!row || !addName.trim()) return;
    setAddBusy(true);
    const { data, error } = await supabase.rpc("lfg_add_guest", { p_id: row.id, p_name: addName.trim() });
    setAddBusy(false);
    const res = data as { ok?: boolean; error?: string } | null;
    if (error || !res?.ok) return toast.error(res?.error ?? error?.message ?? "Could not add that player");
    toast.success(`${addName.trim()} added to the lobby`);
    setAddName("");
    void load();
  };

  const linkGame = async () => {
    if (!row || !linkCode.trim()) return;
    setLinkBusy(true);
    const { data, error } = await supabase.rpc("lfg_link_game" as never, { p_id: row.id, p_public_match_id: linkCode.trim() } as never);
    setLinkBusy(false);
    const res = data as { ok?: boolean; error?: string } | null;
    if (error || !res?.ok) return toast.error(res?.error ?? error?.message ?? "Could not link that match");
    await applyLeagueElo(row.id);
    toast.success("Result linked to this lobby");
    setLinkCode("");
    void load();
  };

  if (loading) {
    return (
      <Shell>
        <div className="flex justify-center py-20"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      </Shell>
    );
  }
  if (!row) {
    return (
      <Shell>
        <Card className="p-10 text-center text-muted-foreground">This lobby doesn't exist or you don't have access to it.</Card>
      </Shell>
    );
  }

  const full = seats.length >= 4;
  const hostName = seats.find((seat) => seat.host)?.name;
  const lobbyName = hostName && hostName !== UNKNOWN_NAME ? `${hostName}'s Game` : "New Match Open!";
  const live = (row.mode ?? "async").toLowerCase() === "live";
  const started = row.status === "started";
  const openLobby = ["pending_creation", "posting", "searching"].includes(row.status);
  const discordUrl = row.guild_id && row.channel_id && row.message_id ? `https://discord.com/channels/${row.guild_id}/${row.channel_id}/${row.message_id}` : null;
  const timeline = [
    { at: row.created_at, text: "Lobby created" },
    ...chats.map((c) => ({ at: c.created_at ?? row.created_at, text: `${c.sender_name}: ${CHAT_LABEL[c.message_code] ?? c.message_code}` })),
    ...events.map((e) => ({ at: e.created_at, text: e.kind === "join" || e.kind === "leave" || !e.actor_name ? e.detail : `${e.detail} (by ${e.actor_name})` })),
    ...(row.auto_start_at ? [{ at: row.auto_start_at, text: "Auto-start time" }] : []),
    ...(row.expires_at ? [{ at: row.expires_at, text: "Lobby expires" }] : []),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return (
    <Shell>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <img src={live ? liveIcon.url : asyncIcon.url} alt={live ? "Live" : "ASync"} className="size-8 shrink-0 object-contain" />
            <h1 className="font-display text-3xl break-words">{lobbyName}</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Lobby {row.match_id ?? `#${row.id}`}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {(row.mode ?? "async").toUpperCase()} · {row.board_type ?? "Board not set"}
            {[...(row.expansions ?? []), ...(row.modules ?? [])].length ? ` · ${[...(row.expansions ?? []), ...(row.modules ?? [])].join(", ")}` : ""}
          </p>
          <div className="mt-2"><LobbyFormatIcons row={row} /></div>
        </div>
        <div className="flex flex-wrap gap-2">
          {row.is_league && (
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/50 bg-primary/10 px-2.5 py-1 text-xs text-primary">
              <Trophy className="size-3.5" /> League · {row.league_status ?? "open"}
            </span>
          )}
          <span className="inline-flex items-center rounded-full border border-border/60 px-2.5 py-1 text-xs capitalize">{row.status}</span>
          {canManage && <CancelLobbyButton id={row.id} status={row.status} onCancelled={() => void load()} />}
          {canLeaveLobby(row, userId, myDiscordId) && <LeaveLobbyButton id={row.id} onLeft={() => void load()} />}
          <LobbyStartControls row={row} count={seats.length} member={member} onChanged={load} />
          {discordUrl && (
            <Button asChild size="sm" variant="outline"><a href={discordUrl} target="_blank" rel="noreferrer">Open in Discord</a></Button>
          )}
        </div>
      </div>
      <div className="max-w-md">
        {(member || canManage) ? (
          <LobbyPasswordRow row={row} canEdit={canManage} onSaved={() => void load()} />
        ) : (
          <p className="text-xs text-muted-foreground">Join this lobby to see its password.</p>
        )}
      </div>

      {row.message_text?.trim() && (
        <p className="text-sm text-muted-foreground">{row.message_text.replace(/<[^>]*>/g, "").trim()}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 bg-card/70 border-border/60 p-4 space-y-3">
          <h2 className="font-display text-lg flex items-center gap-2"><Users className="size-4" /> Players ({seats.length}/4)</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => {
              const seat = seats[i];
              return seat ? (
                <SeatCard
                  key={i}
                  seat={seat}
                  color={seat.playerKey ? colorForKey(titles, seat.playerKey) : undefined}
                  elo={row.is_league && isAdmin ? (seat.playerKey ? ratings[seat.playerKey] ?? 1000 : null) : null}
                  isAdmin={isAdmin}
                  onMapped={load}
                  onRemove={canManage && openLobby && !seat.host ? () => removeSeat(seat) : undefined}
                />
              ) : (
                <div key={i} className="rounded-lg border border-dashed border-border/60 p-4 text-sm text-muted-foreground">Open seat</div>
              );
            })}
          </div>
          {(canManage || member) && !full && openLobby && (
            <div className="flex gap-2 max-w-md">
              <Input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Add player (in-game name)" className="h-9" />
              <Button size="sm" onClick={addPlayer} disabled={addBusy || !addName.trim()}>
                {addBusy ? <Loader2 className="size-4 animate-spin" /> : "Add player"}
              </Button>
            </div>
          )}
          {member && <p className="text-xs text-teal">You're recognised as a player in this lobby.</p>}
        </Card>

        <Card className="bg-card/70 border-border/60 p-4 space-y-3">
          <h2 className="font-display text-lg flex items-center gap-2"><Clock className="size-4" /> Activity</h2>
          <ol className="space-y-2 text-sm">
            {timeline.map((t, i) => (
              <li key={i} className="border-l-2 border-border/60 pl-3">
                <div className="text-xs text-muted-foreground">{fmt(t.at)}</div>
                <div>{t.text}</div>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground">Joins, leaves and setting changes are recorded from 8 Oct 2026 onwards.</p>
        </Card>
      </div>

      <Card className="bg-card/70 border-border/60 p-4 space-y-3">
        <h2 className="font-display text-lg flex items-center gap-2"><Upload className="size-4" /> Result</h2>
        {linkedCode ? (
          <p className="text-sm">
            Linked result:{" "}
            <Link to="/match/$matchId" params={{ matchId: linkedCode }} className="text-primary underline underline-offset-2">{linkedCode}</Link>
          </p>
        ) : !(full || started) ? (
          <p className="text-sm text-muted-foreground">The result upload opens once the lobby is full or started.</p>
        ) : !canReport ? (
          <p className="text-sm text-muted-foreground">Only players in this lobby or LFG admins can report its result.</p>
        ) : (
          <div className="space-y-3">
            {canUpload && <LobbyResultUpload row={row} seats={seats} userId={userId} onDone={() => void load()} />}
            <p className="text-xs text-muted-foreground">Already uploaded it? Paste the match ID (for example SPICE-CORIOLIS-8930) to link it:</p>
            <div className="flex gap-2 max-w-md">
              <Input value={linkCode} onChange={(e) => setLinkCode(e.target.value)} placeholder="Match ID" />
              <Button onClick={linkGame} disabled={linkBusy || !linkCode.trim()}>
                {linkBusy ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />} Link
              </Button>
            </div>
          </div>
        )}
      </Card>
    </Shell>
  );
}

function SeatCard({ seat, color, elo, isAdmin, onMapped, onRemove }: { seat: Seat; color?: string; elo: number | null; isAdmin: boolean; onMapped: () => void; onRemove?: () => void }) {
  const [open, setOpen] = useState(false);
  const [ign, setIgn] = useState("");
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!seat.discordId || !ign.trim()) return;
    if (!confirm(`Have you verified this Discord account and ${ign.trim()} belong to the same person?`)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("lfg_admin_map_discord" as never, {
      p_discord_user_id: seat.discordId,
      p_discord_username: handle.trim().replace(/^@/, ""),
      p_player_key: ign.trim(),
      p_display_name: ign.trim(),
    } as never);
    setBusy(false);
    const res = data as { ok?: boolean; error?: string } | null;
    if (error || !res?.ok) return toast.error(res?.error ?? error?.message ?? "Could not save the link");
    toast.success(`Discord account linked to ${ign.trim()}`);
    setOpen(false);
    onMapped();
  };

  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {seat.web && <Globe className="size-3.5 text-teal shrink-0" />}
          {seat.playerKey && seat.name !== UNKNOWN_NAME ? (
            <Link to="/players/$key" params={{ key: seat.playerKey }} className="truncate font-medium hover:underline" style={{ color }}>{seat.name}</Link>
          ) : (
            <span className="truncate italic text-muted-foreground">{seat.name}</span>
          )}
          {seat.host && <span className="rounded-full border border-border/60 px-1.5 text-[10px] uppercase text-muted-foreground">Host</span>}
        </div>
        <div className="flex items-center gap-1">
          {elo !== null && <span className="text-xs tabular-nums text-primary">{Math.round(elo)} Elo</span>}
          {onRemove && (
            <Button size="icon" variant="ghost" className="size-7 text-muted-foreground hover:text-destructive" onClick={onRemove} aria-label={`Remove ${seat.name}`} title="Remove from lobby">
              <UserMinus className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-1 text-[11px] text-muted-foreground">
        {seat.discord && <span className="rounded border border-border/60 px-1.5">Discord{seat.discordHandle ? ` @${seat.discordHandle}` : ""}</span>}
        {seat.web && <span className="rounded border border-border/60 px-1.5">Website</span>}
        {seat.guest && <span className="rounded border border-border/60 px-1.5">Guest (not linked)</span>}
      </div>
      {isAdmin && seat.discordId && (
        open ? (
          <div className="flex gap-2">
            <Input value={ign} onChange={(e) => setIgn(e.target.value)} placeholder="Correct in-game name" className="h-8" />
            <Input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="Discord name (optional)" className="h-8" />
            <Button size="sm" onClick={save} disabled={busy || !ign.trim()}>{busy ? <Loader2 className="size-3.5 animate-spin" /> : "Save"}</Button>
          </div>
        ) : (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setIgn(seat.playerKey ?? ""); setHandle(seat.discordHandle ?? ""); setOpen(true); }}>
            Fix in-game name link
          </Button>
        )
      )}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 container mx-auto max-w-5xl px-4 py-8 space-y-5">
        <Link to="/lfg" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to LFG
        </Link>
        {children}
      </main>
    </div>
  );
}
