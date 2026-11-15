import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { leagueRankMovement } from "@/lib/league-rank-history";

export function LeagueRankMovement({
  rankBefore,
  rankAfter,
  className = "",
}: {
  rankBefore: number | null | undefined;
  rankAfter: number | null | undefined;
  className?: string;
}) {
  const movement = leagueRankMovement(rankBefore ?? null, rankAfter ?? null);
  if (!movement) return null;
  const description = movement.kind === "new"
    ? `New on the League leaderboard at rank ${movement.rank_after}`
    : movement.kind === "same"
      ? `Stayed at League rank ${movement.rank_after}`
      : `${movement.kind === "up" ? "Climbed" : "Dropped"} ${movement.places} League ${movement.places === 1 ? "place" : "places"}, from rank ${movement.rank_before} to ${movement.rank_after}`;

  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap text-[10px] tabular-nums ${className}`}
      aria-label={description}
      title={description}
    >
      <span className="text-muted-foreground">Rank #{movement.rank_after}</span>
      {movement.kind === "new" ? (
        <span className="font-semibold uppercase tracking-wide text-sand">NEW</span>
      ) : movement.kind === "up" ? (
        <span className="inline-flex items-center font-semibold text-teal"><ArrowUp className="size-3" />{movement.places}</span>
      ) : movement.kind === "down" ? (
        <span className="inline-flex items-center font-semibold text-coral"><ArrowDown className="size-3" />{movement.places}</span>
      ) : (
        <span className="inline-flex items-center text-muted-foreground"><Minus className="size-3" />0</span>
      )}
    </span>
  );
}
