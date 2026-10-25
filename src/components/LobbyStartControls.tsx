import { useEffect, useState } from "react";
import { Gamepad2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { leagueStartAction } from "@/lib/lfg-alerts";
import type { LfgRow } from "@/lib/lfg-seats";

export function LobbyStartControls({ row, count, member, onChanged }: { row: LfgRow; count: number; member: boolean; onChanged: () => void }) {
  const [vote, setVote] = useState<{ approvals: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!row.is_league || count !== 3) { setVote(null); return; }
    let active = true;
    const load = async () => {
      const { data } = await supabase.from("lfg_three_player_votes").select("approvals").eq("lobby_id", row.id).maybeSingle();
      if (active) setVote(data);
    };
    void load();
    const channel = supabase.channel(`lfg-vote-${row.id}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "lfg_three_player_votes", filter: `lobby_id=eq.${row.id}` }, () => { void load(); onChanged(); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "lobby_quick_chats", filter: `lobby_id=eq.${row.id}` }, () => { void load(); onChanged(); })
      .subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [row.id, row.is_league, count, onChanged]);
  if (row.status !== "searching" || (row.expires_at && Date.parse(row.expires_at) <= Date.now())) return null;
  const action = leagueStartAction(!!row.is_league, count);
  const start = async () => {
    setBusy(true);
    const result = action === "vote"
      ? await supabase.rpc("lfg_vote_three", { p_id: row.id, p_agree: !!vote })
      : await supabase.rpc("lfg_start_game", { p_id: row.id });
    setBusy(false);
    const data = result.data as { ok?: boolean; started?: boolean; error?: string } | null;
    if (result.error || !data?.ok) { toast.error(data?.error ?? result.error?.message ?? "Could not start the lobby"); return; }
    toast.success(data.started ? "Game started" : "Three-player vote recorded");
    onChanged();
  };
  return <div className="flex flex-wrap items-center gap-2">
    {vote && <span className="text-sm text-primary">Start with 3 players? {vote.approvals.length}/3 agreed</span>}
    {member && action !== "none" && <Button size="sm" variant={action === "vote" ? "outline" : "default"} disabled={busy} onClick={start}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Gamepad2 className="size-4" />}
      {action === "vote" ? vote ? "Agree to start with 3" : "Vote to start with 3" : "Start game"}
    </Button>}
  </div>;
}