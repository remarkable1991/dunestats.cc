import { createFileRoute, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { seasonTournamentOptions } from "@/components/SeasonTournament";
import { RegisterForm } from "@/routes/tournament-register";
import { normalizeTournament } from "@/lib/tournaments";

export const Route = createFileRoute("/season-tournament/$season")({
  loader: async ({ params, context }) => {
    const season = Number(params.season);
    if (!Number.isInteger(season) || season <= 0) throw notFound();
    const data = await context.queryClient.ensureQueryData(seasonTournamentOptions(season));
    if (!data.tournament) throw notFound();
    return data.tournament;
  },
  head: ({ loaderData }) => ({ meta: [
    { title: `${loaderData?.name ?? "Season Tournament"} · Strategy Arena` },
    { name: "description", content: "Register for the community-funded end-of-season League tournament. Share your availability and help decide the format." },
    { property: "og:title", content: `${loaderData?.name ?? "Season Tournament"} · Strategy Arena` },
    { property: "og:description", content: "Seasonal League tournament registration, community prizes and format discussion." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: SeasonTournamentPage,
});

function SeasonTournamentPage() {
  const { data } = useSuspenseQuery(seasonTournamentOptions(Number(Route.useParams().season)));
  if (!data.tournament) throw notFound();
  return <RegisterForm tournament={normalizeTournament(data.tournament)} multiOpen={false} />;
}