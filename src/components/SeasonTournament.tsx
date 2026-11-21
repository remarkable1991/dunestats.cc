import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { Trophy, Heart, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSeasonTournament } from "@/lib/donations.functions";
import { SEASON_FORMAT_DISCUSSION } from "@/lib/season-tournament";
import type { TournamentConfig } from "@/lib/tournaments";
import type { ComponentPropsWithoutRef } from "react";

export const seasonTournamentOptions = (seasonId: number) => queryOptions({
  queryKey: ["season-tournament", seasonId],
  queryFn: () => getSeasonTournament({ data: { seasonId } }),
  staleTime: 30_000,
  refetchInterval: 60_000,
});

export function TournamentRegistrationLink({ tournament, children, ...props }: { tournament: TournamentConfig } & ComponentPropsWithoutRef<"a">) {
  return tournament.hide_tournament_number && tournament.league_season_id
    ? <Link {...props} to="/season-tournament/$season" params={{ season: String(tournament.league_season_id) }}>{children}</Link>
    : <Link {...props} to="/tournament-register" search={{ t: tournament.tournament_num }}>{children}</Link>;
}

export function SeasonPrizePool({ seasonId }: { seasonId: number | null | undefined }) {
  const { data, isError } = useQuery({ ...seasonTournamentOptions(seasonId ?? 1), enabled: seasonId != null && seasonId > 0 });
  if (seasonId == null || seasonId <= 0) return null;
  const amount = data ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(data.prizePool) : null;
  return (
    <div className="space-y-2 min-w-0">
      <div className="flex items-center gap-2 text-sand font-medium text-sm flex-wrap">
        <Trophy className="size-4 shrink-0" />
        <span>Season {seasonId} Prize Pool: {amount ?? (isError ? "Unavailable" : "…")}</span>
      </div>
      {data?.tournament && <p className="text-xs text-muted-foreground">Prizes for the {data.tournament.name}.</p>}
      <div className="flex flex-wrap gap-2">
        {data?.tournament && <Button asChild variant="outline" size="sm"><Link to="/season-tournament/$season" params={{ season: String(seasonId) }}>View tournament & register</Link></Button>}
        <Button asChild variant="outline" size="sm"><Link to="/support"><Heart className="size-4" />Contribute to prizes</Link></Button>
      </div>
    </div>
  );
}

export function SeasonTournamentDetails({ tournament }: { tournament: TournamentConfig }) {
  if (tournament.league_season_id == null) return null;
  return <div className="space-y-3">
    <p className="text-sm font-medium text-sand">Requires {tournament.min_league_games} League games in Season {tournament.league_season_id}</p>
    {tournament.format_tbd && <div className="flex gap-2 items-center flex-wrap"><span className="text-sm text-muted-foreground">Format: TBD</span><Button asChild size="sm" variant="outline"><a href={SEASON_FORMAT_DISCUSSION} target="_blank" rel="noopener noreferrer"><MessageCircle className="size-4" />Discuss the format</a></Button></div>}
    <SeasonPrizePool seasonId={tournament.league_season_id} />
  </div>;
}