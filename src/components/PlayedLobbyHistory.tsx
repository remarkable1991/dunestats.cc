import { usePlayerTitles, colorForKey } from "@/lib/player-title";
import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { loadLobbyIdentities } from "@/lib/lfg-identity-loader";
import { seatsOf, type LfgRow } from "@/lib/lfg-seats";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LobbyFormatIcons } from "@/components/LobbyFormatIcons";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Loader2, Search, UserRound, X } from "lucide-react";
import liveIcon from "@/assets/live-mode.png.asset.json";
import asyncIcon from "@/assets/async-mode.png.asset.json";

const PAGE_SIZE = 12;

type HistoryResponse = { rows: LfgRow[]; count: number };
type DeltaMap = Record<string, { player_key: string; elo_delta: number }[]>;

export function PlayedLobbyHistory() {
  const [page, setPage] = useState(0);
  const titles = usePlayerTitles();
  const [mode, setMode] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [rows, setRows] = useState<LfgRow[]>([]);
  const [identities, setIdentities] = useState<Awaited<ReturnType<typeof loadLobbyIdentities>>>({ names: {}, keys: {}, handles: {}, verified: {} });
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deltas, setDeltas] = useState<DeltaMap>({});

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(0);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: rpcError } = await supabase.rpc("lfg_played_history" as never, {
        p_search: debouncedSearch,
        p_mode: mode,
        p_page: page,
        p_page_size: PAGE_SIZE,
      } as never);
      if (rpcError) throw rpcError;
      const result = data as unknown as HistoryResponse | null;
      const list = result?.rows ?? [];
      const ids = [...new Set(list.flatMap((r) => [...(r.player_ids ?? []), r.host_id]).filter(Boolean))];
      const resolved = ids.length ? await loadLobbyIdentities(ids) : { names: {}, keys: {}, handles: {}, verified: {} };
      const gameIds = list.filter((r) => r.is_league && r.linked_game_id).map((r) => r.linked_game_id as string);
      const dm: DeltaMap = {};
      if (gameIds.length) {
        const { data: ds } = await supabase.from("league_match_rating_deltas" as never).select("game_id,player_key,elo_delta").in("game_id", gameIds);
        for (const d of (ds as unknown as { game_id: string; player_key: string; elo_delta: number }[]) ?? []) {
          (dm[d.game_id] ??= []).push({ player_key: d.player_key, elo_delta: Number(d.elo_delta) });
        }
        for (const k in dm) dm[k].sort((a, b) => b.elo_delta - a.elo_delta);
      }
      setRows(list);
      setCount(Number(result?.count ?? 0));
      setIdentities(resolved);
      setDeltas(dm);
    } catch {
      setError("Could not load played lobbies.");
    } finally {
      setLoading(false);
    }
  }, [page, mode, debouncedSearch]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const ch = supabase
      .channel("played-lobbies")
      .on("postgres_changes", { event: "*", schema: "public", table: "active_async_matches" }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const searchForPlayer = (name: string) => {
    setPage(0);
    setSearch(name);
    document.getElementById("played-lobby-search")?.focus();
  };

  const playerControls = (name: string, playerKey: string | null) => (
    <span className="flex min-w-0 items-center gap-1">
      <button
        type="button"
        className="truncate text-left hover:underline"
        style={{ color: colorForKey(titles, playerKey ?? name) }}
        title={`Show ${name}'s recent LFG games`}
        onClick={() => searchForPlayer(name)}
      >
        {name}
      </button>
      {playerKey && (
        <Link to="/players/$key" params={{ key: playerKey }} aria-label={`Open ${name}'s profile`} title="Open player profile" className="shrink-0 text-muted-foreground hover:text-foreground">
          <UserRound className="size-3.5" />
        </Link>
      )}
    </span>
  );

  return (
    <section className="space-y-4 border-t border-border pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl">Previously played</h2>
        <div className="flex flex-wrap gap-1">
          {["all", "league", "pending", "unreported", "live", "async"].map((value) => (
            <Button key={value} size="sm" variant={mode === value ? "secondary" : "ghost"} onClick={() => { setMode(value); setPage(0); }}>
              {(value === "live" || value === "async") && <img src={value === "live" ? liveIcon.url : asyncIcon.url} alt="" className="size-4" />}
              {value === "all" ? "All" : value === "league" ? "League" : value === "pending" ? "Currently pending" : value === "unreported" ? "League · not reported" : value === "live" ? "Live" : "ASync"}
            </Button>
          ))}
        </div>
      </div>

      <div className="relative w-full sm:max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="played-lobby-search"
          aria-label="Filter played lobbies by player name"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Find a player's recent LFG games…"
          className="pl-9 pr-9"
        />
        {search && (
          <button type="button" aria-label="Clear player search" onClick={() => { setSearch(""); setPage(0); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Search seated players, Discord names, and reported results. Click a player's name below to filter their games.</p>

      {loading ? (
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      ) : error ? (
        <div className="text-destructive">{error} <Button variant="outline" onClick={() => void load()}>Retry</Button></div>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground">{debouncedSearch ? `No played LFG games found for “${debouncedSearch}”.` : "No played lobbies found."}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => {
            const seats = seatsOf(row, identities.names, identities.keys, identities.handles, identities.verified);
            const hostSeat = seats.find((s) => s.host);
            const host = hostSeat?.name;
            const ds = row.linked_game_id ? deltas[row.linked_game_id] ?? [] : [];
            const nameFor = (k: string) => seats.find((s) => s.playerKey?.toLowerCase() === k.toLowerCase())?.name ?? k;
            const report = !row.is_league ? null : ds.length > 0 ? <Badge>Elo applied</Badge> : row.linked_game_id ? <Badge variant="secondary">Linked · no Elo</Badge> : <Badge variant="destructive">Not reported</Badge>;
            return (
              <article key={row.id} className="rounded-md border border-border p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <Link to="/lfg/$id" params={{ id: String(row.id) }} className="font-medium text-primary hover:underline">
                    {host ? <><span style={{ color: colorForKey(titles, hostSeat?.playerKey) }}>{host}</span>'s game</> : `Lobby #${row.id}`}
                  </Link>
                  <div className="flex flex-wrap justify-end gap-1">{report}<Badge variant="outline">{row.is_league ? "League" : row.mode === "live" ? "Live" : "ASync"}</Badge></div>
                </div>
                <p className="text-xs text-muted-foreground">#{row.id} · {new Date(row.created_at).toLocaleString()} · {row.status}</p>
                <LobbyFormatIcons row={row} />
                {ds.length > 0 ? (
                  <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                    {ds.map((d) => (
                      <li key={d.player_key} className="flex items-center justify-between gap-2">
                        {playerControls(nameFor(d.player_key), d.player_key)}
                        <span className={`shrink-0 tabular-nums font-medium ${d.elo_delta >= 0 ? "text-primary" : "text-destructive"}`}>{d.elo_delta >= 0 ? "+" : ""}{d.elo_delta.toFixed(1)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                    {seats.map((seat, i) => seat.playerKey ? <span key={i}>{playerControls(seat.name, seat.playerKey)}</span> : <span key={i}>{seat.name}</span>)}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-muted-foreground">{count} {count === 1 ? "lobby" : "lobbies"}{debouncedSearch ? ` · ${debouncedSearch}` : ""} · Page {page + 1}</span>
        <Button aria-label="Previous played lobbies" title="Previous page" size="icon" variant="outline" disabled={loading || page === 0} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="size-4" /></Button>
        <Button aria-label="Next played lobbies" title="Next page" size="icon" variant="outline" disabled={loading || (page + 1) * PAGE_SIZE >= count} onClick={() => setPage((p) => p + 1)}><ChevronRight className="size-4" /></Button>
      </div>
    </section>
  );
}
