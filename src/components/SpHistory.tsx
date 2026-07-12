import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type SpEvent = {
  id: string;
  action_type: string;
  amount: number;
  created_at: string;
  is_legacy: boolean;
  player_key: string;
};

const ACTION_LABELS: Record<string, string> = {
  daily_checkin: "Daily Check-In",
  match_participation: "Match Participation",
  tournament_round_win: "Tournament Round Win",
  tournament_completion: "Tournament Completion",
  tournament_semi_finals_reached: "Reached Semi-Finals",
  tournament_grand_finals_reached: "Reached Grand Finals",
  tournament_grand_finals_won: "Won Grand Finals",
  referral_signup: "Referral Sign-Up",
  referral_signup_new_user: "Referral Bonus (New User)",
  referral_jackpot: "Referral Jackpot",
};

function label(action: string) {
  return ACTION_LABELS[action] ?? action.replace(/_/g, " ");
}

export function SpHistory({ userId }: { userId: string }) {
  const [events, setEvents] = useState<SpEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Find player_keys claimed by this user
      const { data: mine } = await supabase
        .from("player_sp")
        .select("player_key")
        .eq("claimed_by", userId);
      const keys = (mine ?? []).map((r) => r.player_key);
      if (keys.length === 0) {
        if (!cancelled) {
          setEvents([]);
          setLoading(false);
        }
        return;
      }
      const { data } = await supabase
        .from("sp_events")
        .select("id, action_type, amount, created_at, is_legacy, player_key")
        .in("player_key", keys)
        .order("created_at", { ascending: false })
        .limit(200);
      if (cancelled) return;
      setEvents((data as SpEvent[]) ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <Card className="p-5 border-border/60 bg-card/70 mt-6">
      <div className="flex items-center gap-2 mb-3">
        <History className="size-5 text-sand" />
        <h2 className="font-display text-lg">SP history</h2>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No SP activity yet. Play or upload a match to get started.
        </p>
      ) : (
        <div className="max-h-96 overflow-y-auto -mx-2">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground sticky top-0 bg-card/95 backdrop-blur">
              <tr>
                <th className="text-left px-2 py-2 font-medium">Date</th>
                <th className="text-left px-2 py-2 font-medium">Action</th>
                <th className="text-right px-2 py-2 font-medium">SP</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-t border-border/40">
                  <td className="px-2 py-2 text-muted-foreground whitespace-nowrap">
                    {new Date(e.created_at).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                  <td className="px-2 py-2">
                    {label(e.action_type)}
                    {e.is_legacy && (
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground border border-border/60 rounded px-1 py-0.5">
                        legacy
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-teal">
                    +{e.amount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
