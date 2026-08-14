import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CalendarPlus, Loader2, Rocket } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  type MatchSchedule,
  elapsedSince,
  formatLocalMatchTime,
  googleCalendarUrl,
  parseScheduleTime,
} from "@/lib/match-schedules";

const pill = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]";

/**
 * Renders schedule state for a tournament table (live confirmed time / vote
 * progress, or async start controls). Renders nothing when no schedule row
 * exists so tables without Discord scheduling still display normally.
 */
export function TableScheduleControls({
  schedule,
  finished,
  canStart,
  title,
  onChanged,
}: {
  schedule: MatchSchedule | null | undefined;
  finished: boolean;
  canStart: boolean;
  title: string;
  onChanged: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  if (!schedule || finished) return null;

  const when = parseScheduleTime(schedule);
  const mode = (schedule.mode ?? "").toLowerCase();
  const status = (schedule.status ?? "").toLowerCase();

  if (mode === "live") {
    if (status === "confirmed") {
      if (!when) return null;
      const started = when.getTime() <= Date.now();
      return (
        <div className="flex items-center gap-2 flex-wrap">
          {started ? (
            <span className={`${pill} border-red-500/40 bg-red-500/10 text-red-300`}>
              🔴 In Progress (Started {elapsedSince(when)} ago)
            </span>
          ) : (
            <>
              <span className={`${pill} border-emerald-500/40 bg-emerald-500/10 text-emerald-300`}>
                📅 {formatLocalMatchTime(when)}
              </span>
              <Button
                asChild
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[11px] border-sand/40 text-sand hover:bg-sand/10"
              >
                <a
                  href={googleCalendarUrl(title, when, "Strategy Arena tournament match")}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <CalendarPlus className="size-3" /> Add to Calendar
                </a>
              </Button>
            </>
          )}
        </div>
      );
    }
    if (status === "pending_votes") {
      return (
        <span className={`${pill} border-amber-500/40 bg-amber-500/10 text-amber-300`}>
          ⏳ Pending Votes ({schedule.votes_count || 0}/4)
        </span>
      );
    }
    return null;
  }

  if (mode === "async") {
    if (status === "ongoing") {
      return (
        <span className={`${pill} border-sand/40 bg-sand/10 text-sand`}>
          🎲 Ongoing Match{when ? ` · ${elapsedSince(when)}` : ""}
        </span>
      );
    }
    if (status === "published") {
      if (!canStart) {
        return <span className={`${pill} border-border/60 bg-muted/40 text-muted-foreground`}>🕒 Not started</span>;
      }
      const start = async () => {
        setBusy(true);
        try {
          const { error } = await supabase.rpc("mark_async_game_started", {
            p_tournament_num: schedule.tournament_num,
            p_round_type: schedule.round_type,
            p_table_identifier: schedule.table_identifier,
          });
          if (error) throw error;
          toast.success("Game marked as started");
          await onChanged();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Could not start the game");
        } finally {
          setBusy(false);
        }
      };
      return (
        <Button size="sm" className="h-6 px-2 text-[11px]" disabled={busy} onClick={() => void start()}>
          {busy ? <Loader2 className="size-3 animate-spin" /> : <Rocket className="size-3" />} Mark Game Started
        </Button>
      );
    }
  }

  return null;
}
