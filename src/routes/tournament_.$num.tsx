import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Pretty per-tournament URL (e.g. /tournament/16). The tournament hub already
 * renders a selected tournament from its `t` search param, so this simply
 * forwards there.
 */
export const Route = createFileRoute("/tournament_/$num")({
  beforeLoad: ({ params }) => {
    const n = Number(params.num);
    throw redirect({
      to: "/tournament",
      search: Number.isFinite(n) ? { t: n } : {},
    });
  },
});
