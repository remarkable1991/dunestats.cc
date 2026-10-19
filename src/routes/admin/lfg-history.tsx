import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { adminLobbyHistory, linkAdminLobby, revertAdminMatch } from "@/lib/lfg-history.functions";
import { isStartAwardForLobby } from "@/lib/lfg-history";
import { loadLobbyIdentities } from "@/lib/lfg-identity-loader";
import { seatsOf, type LfgRow } from "@/lib/lfg-seats";
import { useRoles } from "@/hooks/use-roles";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { LobbyFormatIcons } from "@/components/LobbyFormatIcons";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, ChevronLeft, ChevronRight, Link2, Loader2, Trash2, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/admin/lfg-history")({
  head: () => ({ meta: [
    { title: "Match & Lobby History · Strategy Arena Admin" },
    { name: "description", content: "Review Dune lobby history, verified player links, match reports and SP corrections." },
    { property: "og:title", content: "Match & Lobby History · Strategy Arena Admin" },
    { property: "og:description", content: "Administrative match history and player identity review for Strategy Arena." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: AdminHistory,
});

type History = Awaited<ReturnType<typeof adminLobbyHistory>>;
type Identity = Awaited<ReturnType<typeof loadLobbyIdentities>>;
type RevertTarget = { lobbyId: number | null; gameId: string | null; title: string };

function Filter({ value, onChange, label, options }: { value: string; onChange: (v: string) => void; label: string; options: [string, string][] }) {
  return <Select value={value} onValueChange={onChange}><SelectTrigger className="w-40" aria-label={label}><SelectValue /></SelectTrigger><SelectContent>{options.map(([v, text]) => <SelectItem key={v} value={v}>{text}</SelectItem>)}</SelectContent></Select>;
}

function AdminHistory() {
  const roles = useRoles();
  const fetchHistory = useServerFn(adminLobbyHistory);
  const linkLobby = useServerFn(linkAdminLobby);
  const revert = useServerFn(revertAdminMatch);
  const [kind, setKind] = useState<"lobbies" | "games">("lobbies");
  const [status, setStatus] = useState("all");
  const [mode, setMode] = useState<"all" | "live" | "async">("all");
  const [league, setLeague] = useState<"all" | "league" | "normal">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [history, setHistory] = useState<History | null>(null);
  const [identities, setIdentities] = useState<Identity>({ names: {}, keys: {}, handles: {}, verified: {} });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mapping, setMapping] = useState<{ id: string; handle: string; name: string } | null>(null);
  const [ign, setIgn] = useState("");
  const [link, setLink] = useState<{ id: number; code: string } | null>(null);
  const [target, setTarget] = useState<RevertTarget | null>(null);
  const load = useCallback(async () => {
    if (!roles.isLfgAdmin) return;
    setLoading(true); setError("");
    try {
      const result = await fetchHistory({ data: { kind, status, mode, league, search, page } });
      if (result.kind === "lobbies") {
        const ids = [...new Set(result.rows.flatMap((r) => [...(r.player_ids ?? []), r.host_id]).filter(Boolean))];
        if (ids.length) setIdentities(await loadLobbyIdentities(ids));
      }
      setHistory(result);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load history"); }
    finally { setLoading(false); }
  }, [roles.isLfgAdmin, kind, status, mode, league, search, page, fetchHistory]);
  useEffect(() => { const timer = setTimeout(() => void load(), 250); return () => clearTimeout(timer); }, [load]);
  const perform = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try { await action(); toast.success("Saved"); setMapping(null); setLink(null); setTarget(null); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); }
    finally { setBusy(false); }
  };
  return <div className="min-h-screen"><Navbar /><main className="container mx-auto px-4 py-8 space-y-6">
    <Link to="/lfg" className="inline-flex gap-2 items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />LFG</Link>
    <div className="flex items-center justify-between gap-4"><h1 className="font-display text-3xl">Match & Lobby History</h1><Button variant="outline" size="icon" title="Refresh history" aria-label="Refresh history" disabled={loading} onClick={() => void load()}><RefreshCw className="size-4" /></Button></div>
    {roles.loading ? <Loader2 className="animate-spin size-5" /> : !roles.isLfgAdmin ? <p className="text-muted-foreground">{roles.userId ? "LFG admin access required." : <Link to="/auth" className="text-primary hover:underline">Sign in with an admin account</Link>}</p> : <>
      <div className="flex flex-wrap gap-2 items-center"><Button variant={kind === "lobbies" ? "secondary" : "outline"} onClick={() => { setKind("lobbies"); setPage(0); }}>Lobbies</Button><Button variant={kind === "games" ? "secondary" : "outline"} onClick={() => { setKind("games"); setPage(0); }}>Uploaded matches</Button>
        {kind === "lobbies" && <Filter label="Lobby status" value={status} onChange={(v) => { setStatus(v); setPage(0); }} options={[["all", "All statuses"], ["started", "Started"], ["cancelled", "Cancelled"], ["timed_out", "Timed out"], ["pending_creation", "Awaiting Discord"], ["posting", "Posting"], ["searching", "Searching"]]} />}
        <Filter label="Play mode" value={mode} onChange={(v) => { if (v === "all" || v === "live" || v === "async") setMode(v); setPage(0); }} options={[["all", "All modes"], ["live", "Live"], ["async", "ASync"]]} />
        <Filter label="League filter" value={league} onChange={(v) => { if (v === "all" || v === "league" || v === "normal") setLeague(v); setPage(0); }} options={[["all", "All formats"], ["league", "League"], ["normal", "Non-League"]]} />
        <Input aria-label="Search history" className="w-64" placeholder={kind === "lobbies" ? "Lobby number or match ID" : "Match ID"} value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
      </div>
      {loading ? <Loader2 className="animate-spin size-5" /> : error ? <p className="text-destructive">{error}</p> : history?.rows.length === 0 ? <p className="text-muted-foreground">No history matches these filters.</p> : history?.kind === "lobbies" ? <div className="space-y-3">{history.rows.map((raw) => {
        const row = raw as LfgRow;
        const seats = seatsOf(row, identities.names, identities.keys, identities.handles, identities.verified);
        const events = history.events.filter((e) => isStartAwardForLobby(e, row.id) || (!!row.linked_game_id && e.ref_game_id === row.linked_game_id));
        const code = history.games.find((g) => g.id === row.linked_game_id)?.public_match_id;
        return <article key={row.id} className="border border-border rounded-md p-4 space-y-3">
          <div className="flex flex-wrap justify-between gap-3"><div className="space-y-2"><Link to="/lfg/$id" params={{ id: String(row.id) }} className="font-display text-lg text-primary hover:underline">#{row.id} · {seats.find((s) => s.host)?.name ?? "Lobby"}'s game</Link><div className="flex flex-wrap gap-2 text-xs items-center"><Badge variant="outline">{row.status}</Badge><span>{row.mode === "live" ? "Live" : "ASync"}{row.is_league ? " · League" : ""}</span><span className="text-muted-foreground">{new Date(row.created_at).toLocaleString()}</span><LobbyFormatIcons row={row} /></div></div><div className="flex flex-wrap items-center gap-2"><Button size="sm" variant="outline" onClick={() => setLink({ id: row.id, code: code ?? "" })}><Link2 className="size-4" />{row.linked_game_id ? "Edit match link" : "Link match"}</Button>{roles.isAdmin && <Button size="sm" variant="destructive" onClick={() => setTarget({ lobbyId: row.id, gameId: row.linked_game_id ?? null, title: `Lobby #${row.id}` })}><Trash2 className="size-4" />{row.linked_game_id ? "Delete result & revert" : "Cancel & revert SP"}</Button>}</div></div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">{seats.map((seat, i) => <div key={i} className="min-w-0 text-sm space-y-1"><div>{seat.playerKey ? <Link to="/players/$key" params={{ key: seat.playerKey }} className="hover:underline">{seat.name}</Link> : seat.name}</div>{seat.discordId && <div className="text-xs text-muted-foreground break-all">{seat.discordHandle || seat.discordId}</div>}{seat.discordId && <Button size="sm" variant="ghost" onClick={() => { setMapping({ id: seat.discordId ?? "", handle: seat.discordHandle ?? "", name: seat.name }); setIgn(seat.playerKey ?? ""); }}><Link2 className="size-3" />{seat.identityVerified ? "Review IGN link" : "Link IGN"}</Button>}</div>)}</div>
          {code && <Link to="/match/$matchId" params={{ matchId: code }} className="text-sm text-primary hover:underline">#{code}</Link>}
          <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">{events.reduce((sum, e) => sum + e.amount, 0)} SP · {events.length} awards</summary><ul className="mt-2 space-y-1">{events.map((e) => <li key={e.id} className="flex flex-wrap justify-between gap-2"><span>{e.player_key} · {e.action_type.replaceAll("_", " ")}</span><span>{e.amount} SP</span></li>)}</ul></details>
        </article>;
      })}</div> : history?.kind === "games" ? <div className="space-y-3">{history.rows.map((game) => {
        const results = history.results.filter((r) => r.game_id === game.id);
        const events = history.events.filter((e) => e.ref_game_id === game.id);
        const lobby = history.links.find((l) => l.linked_game_id === game.id);
        return <article key={game.id} className="border border-border rounded-md p-4 space-y-3"><div className="flex flex-wrap justify-between gap-3"><div><Link to="/match/$matchId" params={{ matchId: game.public_match_id ?? game.id }} className="text-primary font-medium hover:underline">#{game.public_match_id ?? game.id}</Link><p className="text-xs text-muted-foreground">{new Date(game.created_at).toLocaleString()} · {game.play_mode ?? "Unspecified mode"} · {game.game_version}{game.is_league ? " · League" : ""}</p></div>{roles.isAdmin && <Button variant="destructive" size="sm" onClick={() => setTarget({ lobbyId: lobby?.id ?? null, gameId: game.id, title: `Match #${game.public_match_id ?? game.id}` })}><Trash2 className="size-4" />Delete & revert Elo/SP</Button>}</div><div className="flex flex-wrap gap-4 text-sm">{results.map((r) => <span key={r.player_name}><Link to="/players/$key" params={{ key: r.player_name.trim().toLowerCase() }} className="hover:underline">{r.player_name}</Link> · {Number(r.elo_delta_overall) >= 0 ? "+" : ""}{Number(r.elo_delta_overall).toFixed(1)} overall Elo</span>)}</div><div className="flex gap-3 text-sm text-muted-foreground"><span>{events.reduce((s, e) => s + e.amount, 0)} result SP</span>{lobby && <Link to="/lfg/$id" params={{ id: String(lobby.id) }} className="text-primary hover:underline">Lobby #{lobby.id}</Link>}</div></article>;
      })}</div> : null}
      <div className="flex gap-2 items-center justify-end"><span className="text-xs text-muted-foreground">{history?.count ?? 0} entries · Page {page + 1}</span><Button size="icon" variant="outline" title="Previous page" aria-label="Previous history page" disabled={loading || page === 0} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="size-4" /></Button><Button size="icon" variant="outline" title="Next page" aria-label="Next history page" disabled={loading || (page + 1) * 20 >= (history?.count ?? 0)} onClick={() => setPage((p) => p + 1)}><ChevronRight className="size-4" /></Button></div>
    </>}
    <Dialog open={!!mapping} onOpenChange={(open) => { if (!open && !busy) setMapping(null); }}><DialogContent><DialogHeader><DialogTitle>Confirm Discord → IGN</DialogTitle><DialogDescription>{mapping?.name} · Discord {mapping?.id}. This updates the verified mapping. Conflicting accounts and protected mappings require separate review.</DialogDescription></DialogHeader><Label htmlFor="mapping-ign">Existing in-game name</Label><Input id="mapping-ign" value={ign} onChange={(e) => setIgn(e.target.value)} /><DialogFooter><Button disabled={busy || !ign.trim()} onClick={() => void perform(async () => {
      if (!mapping) return;
      const { data, error: e } = await supabase.rpc("lfg_admin_map_discord", { p_discord_user_id: mapping.id, p_discord_username: mapping.handle, p_player_key: ign.trim().toLowerCase(), p_display_name: ign.trim() });
      if (e) throw e; if (data && typeof data === "object" && "ok" in data && !data.ok) throw new Error("Mapping was not saved");
    })}>{busy && <Loader2 className="animate-spin size-4" />}Confirm link</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!link} onOpenChange={(open) => { if (!open && !busy) setLink(null); }}><DialogContent><DialogHeader><DialogTitle>Match link · Lobby #{link?.id}</DialogTitle><DialogDescription>Accepts #DESERT-MAKER-9440, the match code, or its internal ID. Confirming marks the lobby started.</DialogDescription></DialogHeader><Label htmlFor="match-code">Match ID</Label><Input id="match-code" value={link?.code ?? ""} onChange={(e) => setLink((l) => l ? { ...l, code: e.target.value } : null)} /><DialogFooter><Button variant="outline" disabled={busy} onClick={() => void perform(() => linkLobby({ data: { lobbyId: link?.id ?? 0, matchCode: "" } }))}>Unlink</Button><Button disabled={busy || !link?.code.trim()} onClick={() => void perform(() => linkLobby({ data: { lobbyId: link?.id ?? 0, matchCode: link?.code ?? "" } }))}>Confirm match link</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!target} onOpenChange={(open) => { if (!open && !busy) setTarget(null); }}><DialogContent><DialogHeader><DialogTitle>Revert {target?.title}?</DialogTitle><DialogDescription>{target?.gameId ? "Delete the uploaded result and reverse its recorded global Elo and result SP, plus the linked lobby's start SP. The lobby remains in cancelled history. This cannot be undone." : "Cancel this lobby and remove its start SP awards, including its daily/weekly bonuses. The roster and history remain."} Applied League Elo without reversible bot deltas blocks the entire operation.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setTarget(null)}>Keep match</Button><Button variant="destructive" disabled={busy} onClick={() => void perform(() => revert({ data: { lobbyId: target?.lobbyId ?? null, gameId: target?.gameId ?? null, deleteResult: !!target?.gameId, confirmed: true } }))}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}Confirm reversal</Button></DialogFooter></DialogContent></Dialog>
  </main></div>;
}