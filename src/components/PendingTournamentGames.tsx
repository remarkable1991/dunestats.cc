import { Link } from "@tanstack/react-router";
import { Hourglass } from "lucide-react";
import { usePendingTournamentGames, unmatchedNames } from "@/hooks/use-pending-tournament-games";

export function PendingTournamentGames() {
  const { userId, rows } = usePendingTournamentGames();
  if (!userId || rows.length === 0) return null;
  return (
    <section className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-4">
      <h3 className="font-display text-lg flex items-center gap-2 text-amber-400">
        <Hourglass className="size-5" /> Your games under review ({rows.length})
      </h3>
      <p className="text-xs text-muted-foreground mb-3">
        These results were saved and are waiting for a tournament moderator to approve them. No need to upload again.
      </p>
      <ul className="space-y-2">
        {rows.map((r) => {
          const names = unmatchedNames(r.unmatched);
          return (
            <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium">
                  Tournament #{r.tournament_num}
                  {r.round_type ? ` · ${r.round_type}` : ""}
                  {r.table_identifier ? ` · Table ${r.table_identifier}` : ""}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  Submitted {new Date(r.created_at).toLocaleString()}
                  {names.length ? ` · Name not matched: ${names.join(", ")}` : ""}
                </div>
              </div>
              <Link
                to="/tournament"
                search={{ t: r.tournament_num, round: r.round_type ?? undefined, table: r.table_identifier ?? undefined }}
                className="shrink-0 text-xs text-sand hover:underline"
              >
                View table
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
