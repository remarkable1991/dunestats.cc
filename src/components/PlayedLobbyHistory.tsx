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

export function PlayedLobbyHistory({ pilot }: { pilot: boolean }) {
  const [page, setPage] = useState(0);
  const [mode, setMode] = useState("all");
  const [rows, setRows] = useState<LfgRow[]>([]);
  const [identities, setIdentities] = useState<Awaited<ReturnType<typeof loadLobbyIdentities>>>({ names: {}, keys: {}, handles: {}, verified: {} });
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      let q = supabase.from("active_async_matches").select(SELECT_COLS, { count: "exact" }).in("status", [...STARTED_LOBBY_STATUSES]);
      if (!pilot) q = q.eq("is_league", false);
      if (mode !== "all") q = q.eq("mode", mode);
      const { data, error: e, count: total } = await q.order("created_at", { ascending: false }).range(page * 12, page * 12 + 11);
      if (e) throw e;
      const list = (data ?? []).filter((r) => canShowPlayedLobby(r.status, r.is_league, pilot));
      const ids = [...new Set(list.flatMap((r) => [...(r.player_ids ?? []), r.host_id]).filter(Boolean))];
      const resolved = ids.length ? await loadLobbyIdentities(ids) : { names: {}, keys: {}, handles: {}, verified: {} };
      setRows(list); setCount(total ?? 0); setIdentities(resolved);
    } catch { setError("Could not load played lobbies."); } finally { setLoading(false); }
  }, [page, mode, pilot]);
  useEffect(() => { void load(); }, [load]);
  return <section className="space-y-4 border-t border-border pt-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-xl">Previously played</h2><div className="flex gap-1">{["all", "live", "async"].map((value) => <Button key={value} size="sm" variant={mode === value ? "secondary" : "ghost"} onClick={() => { setMode(value); setPage(0); }}>{value !== "all" && <img src={value === "live" ? liveIcon.url : asyncIcon.url} alt="" className="size-4" />}{value === "all" ? "All" : value === "live" ? "Live" : "ASync"}</Button>)}</div></div>
    {loading ? <Loader2 className="size-5 animate-spin text-muted-foreground" /> : error ? <div className="text-destructive">{error} <Button variant="outline" onClick={() => void load()}>Retry</Button></div> : rows.length === 0 ? <p className="text-muted-foreground">No played lobbies found.</p> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map((row) => {
      const seats = seatsOf(row, identities.names, identities.keys, identities.handles, identities.verified);
      const host = seats.find((s) => s.host)?.name;
      return <article key={row.id} className="rounded-md border border-border p-4 space-y-3"><div className="flex items-start justify-between gap-2"><Link to="/lfg/$id" params={{ id: String(row.id) }} className="font-medium text-primary hover:underline">{host ? `${host}'s game` : `Lobby #${row.id}`}</Link><Badge variant="outline">{row.is_league ? "League" : row.mode === "live" ? "Live" : "ASync"}</Badge></div><p className="text-xs text-muted-foreground">#{row.id} · {new Date(row.created_at).toLocaleString()} · {row.status}</p><LobbyFormatIcons row={row} /><div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">{seats.map((seat, i) => seat.playerKey ? <Link key={i} to="/players/$key" params={{ key: seat.playerKey }} className="hover:underline">{seat.name}</Link> : <span key={i}>{seat.name}</span>)}</div></article>;
    })}</div>}
    <div className="flex items-center justify-end gap-2"><span className="text-xs text-muted-foreground">{count} lobbies · Page {page + 1}</span><Button aria-label="Previous played lobbies" title="Previous page" size="icon" variant="outline" disabled={loading || page === 0} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="size-4" /></Button><Button aria-label="Next played lobbies" title="Next page" size="icon" variant="outline" disabled={loading || (page + 1) * 12 >= count} onClick={() => setPage((p) => p + 1)}><ChevronRight className="size-4" /></Button></div>
  </section>;
}