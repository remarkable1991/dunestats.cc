import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { loadLobbyIdentities } from "@/lib/lfg-identity-loader";
import { SELECT_COLS, seatsOf, type LfgRow } from "@/lib/lfg-seats";
import { STARTED_LOBBY_STATUSES, canShowPlayedLobby } from "@/lib/lfg-history";
import { Button } from "@/components/ui/button";
import { LobbyFormatIcons } from "@/components/LobbyFormatIcons";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import liveIcon from "@/assets/live-mode.png.asset.json";
import asyncIcon from "@/assets/async-mode.png.asset.json";

/** League games started within this window are "currently pending" — players may still be playing or uploading. */
const PENDING_WINDOW_MS = 4 * 60 * 60 * 1000;

export function PlayedLobbyHistory({ pilot }: { pilot: boolean }) {
  const [page, setPage] = useState(0);
  const [mode, setMode] = useState("all");
  const [rows, setRows] = useState<LfgRow[]>([]);
  const [identities, setIdentities] = useState<Awaited<ReturnType<typeof loadLobbyIdentities>>>({ names: {}, keys: {}, handles: {}, verified: {} });
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deltas, setDeltas] = useState<Record<string, { player_key: string; elo_delta: number }[]>>({});
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      let q = supabase.from("active_async_matches").select(SELECT_COLS, { count: "exact" }).in("status", [...STARTED_LOBBY_STATUSES]);
      const pendingSince = new Date(Date.now() - PENDING_WINDOW_MS).toISOString();
      if (mode === "league") q = q.eq("is_league", true);
      else if (mode === "pending") q = q.eq("is_league", true).eq("status", "started").is("linked_game_id", null).gte("created_at", pendingSince);
      else if (mode === "unreported") q = q.eq("is_league", true).eq("status", "started").is("linked_game_id", null).lt("created_at", pendingSince);
      else if (mode !== "all") q = q.eq("mode", mode);
      const { data, error: e, count: total } = await q.order("created_at", { ascending: false }).range(page * 12, page * 12 + 11);
      if (e) throw e;
      const list = (data ?? []).filter((r) => canShowPlayedLobby(r.status, r.is_league, true));
      const ids = [...new Set(list.flatMap((r) => [...(r.player_ids ?? []), r.host_id]).filter(Boolean))];
      const resolved = ids.length ? await loadLobbyIdentities(ids) : { names: {}, keys: {}, handles: {}, verified: {} };
      const gameIds = list.filter((r) => r.is_league && r.linked_game_id).map((r) => r.linked_game_id as string);
      const dm: Record<string, { player_key: string; elo_delta: number }[]> = {};
      if (gameIds.length) {
        const { data: ds } = await supabase.from("league_match_rating_deltas" as never).select("game_id,player_key,elo_delta").in("game_id", gameIds);
        for (const d of (ds as unknown as { game_id: string; player_key: string; elo_delta: number }[]) ?? []) (dm[d.game_id] ??= []).push({ player_key: d.player_key, elo_delta: Number(d.elo_delta) });
        for (const k in dm) dm[k].sort((a, b) => b.elo_delta - a.elo_delta);
      }
      setRows(list); setCount(total ?? 0); setIdentities(resolved); setDeltas(dm);
    } catch { setError("Could not load played lobbies."); } finally { setLoading(false); }
  }, [page, mode, pilot]);
  useEffect(() => { void load(); }, [load]);
  // Live updates: a lobby that pops (starts) appears here without a page refresh.
  useEffect(() => {
    const ch = supabase
      .channel("played-lobbies")
      .on("postgres_changes", { event: "*", schema: "public", table: "active_async_matches" }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);
  return <section className="space-y-4 border-t border-border pt-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-xl">Previously played</h2><div className="flex flex-wrap gap-1">{["all", "league", "pending", "unreported", "live", "async"].map((value) => <Button key={value} size="sm" variant={mode === value ? "secondary" : "ghost"} onClick={() => { setMode(value); setPage(0); }}>{(value === "live" || value === "async") && <img src={value === "live" ? liveIcon.url : asyncIcon.url} alt="" className="size-4" />}{value === "all" ? "All" : value === "league" ? "League" : value === "pending" ? "Currently pending" : value === "unreported" ? "League · not reported" : value === "live" ? "Live" : "ASync"}</Button>)}</div></div>
    {loading ? <Loader2 className="size-5 animate-spin text-muted-foreground" /> : error ? <div className="text-destructive">{error} <Button variant="outline" onClick={() => void load()}>Retry</Button></div> : rows.length === 0 ? <p className="text-muted-foreground">No played lobbies found.</p> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map((row) => {
      const seats = seatsOf(row, identities.names, identities.keys, identities.handles, identities.verified);
      const hostSeat = seats.find((s) => s.host); const host = hostSeat?.name;
      const ds = row.linked_game_id ? deltas[row.linked_game_id] ?? [] : [];
      const nameFor = (k: string) => seats.find((s) => s.playerKey?.toLowerCase() === k.toLowerCase())?.name ?? k;
      const report = !row.is_league ? null : ds.length > 0 ? <Badge>Elo applied</Badge> : row.linked_game_id ? <Badge variant="secondary">Linked · no Elo</Badge> : <Badge variant="destructive">Not reported</Badge>;
      return <article key={row.id} className="rounded-md border border-border p-4 space-y-3"><div className="flex items-start justify-between gap-2"><Link to="/lfg/$id" params={{ id: String(row.id) }} className="font-medium text-primary hover:underline">{host ? <><span style={{ color: colorForKey(titles, hostSeat?.playerKey) }}>{host}</span>'s game</> : `Lobby #${row.id}`}</Link><div className="flex flex-wrap justify-end gap-1">{report}<Badge variant="outline">{row.is_league ? "League" : row.mode === "live" ? "Live" : "ASync"}</Badge></div></div><p className="text-xs text-muted-foreground">#{row.id} · {new Date(row.created_at).toLocaleString()} · {row.status}</p><LobbyFormatIcons row={row} />{ds.length > 0 ? <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">{ds.map((d) => <li key={d.player_key} className="flex justify-between gap-2"><Link to="/players/$key" params={{ key: d.player_key }} className="truncate hover:underline" style={{ color: colorForKey(titles, d.player_key) }}>{nameFor(d.player_key)}</Link><span className={`tabular-nums font-medium ${d.elo_delta >= 0 ? "text-primary" : "text-destructive"}`}>{d.elo_delta >= 0 ? "+" : ""}{d.elo_delta.toFixed(1)}</span></li>)}</ul> : <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">{seats.map((seat, i) => seat.playerKey ? <Link key={i} to="/players/$key" params={{ key: seat.playerKey }} className="hover:underline" style={{ color: colorForKey(titles, seat.playerKey) }}>{seat.name}</Link> : <span key={i}>{seat.name}</span>)}</div>}</article>;
    })}</div>}
    <div className="flex items-center justify-end gap-2"><span className="text-xs text-muted-foreground">{count} lobbies · Page {page + 1}</span><Button aria-label="Previous played lobbies" title="Previous page" size="icon" variant="outline" disabled={loading || page === 0} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="size-4" /></Button><Button aria-label="Next played lobbies" title="Next page" size="icon" variant="outline" disabled={loading || (page + 1) * 12 >= count} onClick={() => setPage((p) => p + 1)}><ChevronRight className="size-4" /></Button></div>
  </section>;
}