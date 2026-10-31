import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { colorForKey } from "@/lib/player-title";
import { useShowAllRatingTracks } from "@/hooks/use-rating-tracks";
import type { Seat } from "@/lib/lfg-seats";

type R = { placement: number; player_name: string; leader_name: string | null; points: number; elo_delta: number | null; elo_delta_overall: number | null };
const loose = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const fmt = (n: number | null | undefined) => (n == null ? "—" : `${n > 0 ? "+" : ""}${Number(n).toFixed(1)}`);
const tone = (n: number | null | undefined) => (n == null ? "text-muted-foreground" : n > 0 ? "text-teal" : n < 0 ? "text-destructive" : "text-muted-foreground");

/** Standings + Elo changes for a lobby's linked match, with IGN / Discord identity per seat. */
export function LobbyLinkedResult({ gameId, code, isLeague, seats, titles }: { gameId: string; code: string; isLeague: boolean; seats: Seat[]; titles: Map<string, number> }) {
  const [rows, setRows] = useState<R[]>([]);
  const [league, setLeague] = useState<Record<string, number>>({});
  const { showAll, setShowAll, signedIn } = useShowAllRatingTracks();

  useEffect(() => {
    let off = false;
    void (async () => {
      const { data } = await supabase.from("game_results").select("placement,player_name,leader_name,points,elo_delta,elo_delta_overall").eq("game_id", gameId).order("placement");
      if (off) return;
      setRows((data as R[]) ?? []);
      if (isLeague) {
        const { data: ds } = await supabase.from("league_match_rating_deltas" as never).select("player_key,elo_delta").eq("game_id", gameId);
        const m: Record<string, number> = {};
        for (const d of (ds as unknown as { player_key: string; elo_delta: number }[]) ?? []) m[loose(d.player_key)] = Number(d.elo_delta);
        if (!off) setLeague(m);
      }
    })();
    return () => { off = true; };
  }, [gameId, isLeague]);

  const seatFor = (name: string) => seats.find((s) => (s.playerKey && loose(s.playerKey) === loose(name)) || loose(s.name) === loose(name) || (s.discordHandle && loose(s.discordHandle) === loose(name)));
  const showGeneral = !isLeague || showAll;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>Linked result: <Link to="/match/$matchId" params={{ matchId: code }} className="text-primary underline underline-offset-2">{code}</Link></span>
        {isLeague && signedIn && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <Checkbox checked={showAll} onCheckedChange={(c) => void setShowAll(!!c)} /> Show all stats
          </label>
        )}
      </div>
      {rows.map((r) => {
        const key = r.player_name.toLowerCase().trim();
        const seat = seatFor(r.player_name);
        const extras: string[] = [];
        if (seat?.discordHandle && loose(seat.discordHandle) !== loose(r.player_name)) extras.push(`@${seat.discordHandle}`);
        if (seat && seat.name && loose(seat.name) !== loose(r.player_name) && (!seat.discordHandle || loose(seat.name) !== loose(seat.discordHandle))) extras.push(seat.name);
        const ld = league[loose(r.player_name)] ?? league[loose(seat?.playerKey ?? "")];
        return (
          <div key={r.placement + r.player_name} className="flex items-center gap-3 rounded-md border border-border/50 bg-background/40 px-3 py-2">
            <span className="font-display text-lg w-6 text-center">{r.placement}</span>
            <div className="min-w-0 flex-1">
              <Link to="/players/$key" params={{ key }} className="font-medium hover:underline underline-offset-2" style={{ color: colorForKey(titles, key) }}>{r.player_name}</Link>
              {extras.length > 0 && <span className="ml-2 text-xs text-muted-foreground">{extras.join(" · ")}</span>}
              <div className="text-xs text-muted-foreground truncate">{r.leader_name ?? "Unknown leader"}</div>
            </div>
            <span className="text-sm tabular-nums w-12 text-right">{r.points} VP</span>
            {isLeague && (
              <div className="text-right w-20">
                <div className="text-[10px] uppercase text-muted-foreground">League</div>
                <div className={`text-sm tabular-nums ${tone(ld)}`}>{fmt(ld)}</div>
              </div>
            )}
            {showGeneral && (
              <>
                <div className="text-right w-16">
                  <div className="text-[10px] uppercase text-muted-foreground">All</div>
                  <div className={`text-sm tabular-nums ${tone(r.elo_delta_overall)}`}>{fmt(r.elo_delta_overall)}</div>
                </div>
                <div className="text-right w-16">
                  <div className="text-[10px] uppercase text-muted-foreground">Version</div>
                  <div className={`text-sm tabular-nums ${tone(r.elo_delta)}`}>{fmt(r.elo_delta)}</div>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
