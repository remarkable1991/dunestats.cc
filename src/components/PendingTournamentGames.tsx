import { Link } from "@tanstack/react-router";
import { Hourglass, Vote, Swords, RefreshCw } from "lucide-react";
import { usePendingTournamentGames, unmatchedNames } from "@/hooks/use-pending-tournament-games";
import { Button } from "@/components/ui/button";
import { formatLocalMatchTime, parseScheduleTime } from "@/lib/match-schedules";
import { tableSlug } from "@/lib/tournament-slug";

const states = {
  vote_needed: { label: "Vote needed", icon: Vote, color: "text-sand" },
  waiting_votes: { label: "Waiting for table votes", icon: Hourglass, color: "text-muted-foreground" },
  awaiting_result: { label: "In progress · Awaiting result", icon: Swords, color: "text-teal" },
  under_review: { label: "Under moderator review", icon: Hourglass, color: "text-sand" },
};

export function PendingTournamentGames() {
  const { userId, rows, tournaments, isError, refresh } = usePendingTournamentGames();
  if (!userId || (rows.length === 0 && !isError)) return null;
  return (
    <section aria-label="Your active and pending tournament games" className="border-y border-primary/30 py-4">
      <h3 className="font-display text-lg flex items-center gap-2 text-sand mb-3">
        <Hourglass className="size-5 shrink-0" /> Your active & pending games ({rows.length})
      </h3>
      {isError ? <div className="flex flex-wrap items-center gap-2 text-sm text-destructive mb-3">Tournament activity could not be refreshed.<Button size="sm" variant="outline" onClick={() => void refresh()}><RefreshCw className="size-4" />Retry</Button></div> : null}
      <ul className="space-y-2">
        {rows.map((r) => {
          const names = unmatchedNames(r.review?.unmatched);
          const state = states[r.kind];
          const Icon = state.icon;
          const tournament = tournaments.find((t) => t.tournament_num === r.tournament_num);
          const when = parseScheduleTime(r.schedule);
          return (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/60 px-3 py-3 text-sm">
              <div className="min-w-0">
                <div className="break-words font-medium">
                  {tournament?.hide_tournament_number ? tournament.name : `Tournament #${r.tournament_num}`}
                  {r.round_type ? ` · ${r.round_type}` : ""}
                  {r.table_identifier ? ` · ${r.table_identifier}` : ""}
                </div>
                <div className={`mt-1 flex items-center gap-1.5 text-xs ${state.color}`}>
                  <Icon className="size-3.5 shrink-0" />{state.label}
                  {r.kind === "vote_needed" || r.kind === "waiting_votes" ? ` (${r.schedule?.votes_count ?? 0}/${r.schedule?.player_names?.length || 4})` : ""}
                </div>
                {r.review ? <div className="mt-1 break-words text-xs text-muted-foreground">Submitted {new Date(r.review.created_at).toLocaleString()} · No need to upload again.{names.length ? ` · Name not matched: ${names.join(", ")}` : ""}</div> : when ? <div className="mt-1 text-xs text-muted-foreground">Started {formatLocalMatchTime(when)}</div> : null}
              </div>
              <Button asChild size="sm" variant="outline" className="shrink-0">
                {(r.kind === "vote_needed" || r.kind === "waiting_votes") && r.round_type && r.table_identifier && !tournament?.hide_tournament_number ? <Link
                  to="/tournament/$num/$table"
                  params={{ num: String(r.tournament_num), table: tableSlug(r.round_type, r.table_identifier) }}
                >View voting</Link> : <Link
                to="/tournament"
                search={{ t: r.tournament_num, round: r.round_type ?? undefined, table: r.table_identifier ?? undefined }}
              >
                {r.kind === "vote_needed" ? "View voting" : r.kind === "awaiting_result" ? "Report result" : "View table"}
                </Link>}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
