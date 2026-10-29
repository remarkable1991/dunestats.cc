import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { MissingVeteran, SeatMatch } from "@/lib/lobby-result-match";

type Review = { id: string; lobby_id: number; public_match_id: string | null; status: "green" | "yellow" | "orange"; players: { rows?: SeatMatch[]; missing?: MissingVeteran[] }; created_at: string };

/** Admin queue of lobby-page result uploads with uncertain player matches. */
export function LfgResultReviews() {
  const [items, setItems] = useState<Review[]>([]);
  const load = useCallback(async () => {
    const { data } = await supabase.from("lfg_result_reviews" as never).select("id,lobby_id,public_match_id,status,players,created_at").is("resolved_at", null).order("created_at", { ascending: false }).limit(50);
    setItems((data as unknown as Review[]) ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const resolve = async (id: string) => {
    const { data: s } = await supabase.auth.getSession();
    const { error } = await supabase.from("lfg_result_reviews" as never).update({ resolved_at: new Date().toISOString(), resolved_by: s.session?.user.id ?? null } as never).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Marked as checked");
    void load();
  };
  if (!items.length) return null;
  return (
    <section className="border border-primary/40 rounded-md p-4 space-y-3">
      <h2 className="font-display text-xl">League results to check ({items.length})</h2>
      <p className="text-xs text-muted-foreground">Submitted from lobby pages with players that weren't fully confirmed. Fix names with Link IGN, the player admin page, or Delete &amp; revert below.</p>
      {items.map((r) => (
        <article key={r.id} className="border border-border rounded-md p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={r.status === "orange" ? "destructive" : "secondary"}>{r.status === "orange" ? "Orange !" : "Yellow !"}</Badge>
              <Link to="/lfg/$id" params={{ id: String(r.lobby_id) }} className="text-primary hover:underline">Lobby #{r.lobby_id}</Link>
              {r.public_match_id && <Link to="/match/$matchId" params={{ matchId: r.public_match_id }} className="text-primary hover:underline">#{r.public_match_id}</Link>}
              <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
            </div>
            <Button size="sm" variant="outline" onClick={() => void resolve(r.id)}>Mark checked</Button>
          </div>
          <ul className="text-sm space-y-1">
            {(r.players.rows ?? []).filter((p) => p.status !== "green").map((p) => <li key={p.rowIndex}>{p.screenshotName} → {p.seatName ?? "no seat"} <span className="text-muted-foreground">· {p.reason}</span></li>)}
            {(r.players.missing ?? []).map((m) => <li key={m.seatIndex} className="text-destructive">{m.seatName} ({m.games} games) missing from screenshot</li>)}
          </ul>
        </article>
      ))}
    </section>
  );
}
