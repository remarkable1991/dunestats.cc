import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/leaderboard/")({
  beforeLoad: () => { throw redirect({ to: "/leaderboard/$", params: { _splat: "league" }, replace: true }); },
});
