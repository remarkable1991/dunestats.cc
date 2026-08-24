import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Pretty per-tournament registration URL (e.g. /tournament-register/16).
 * Forwards to the registration page with the `t` search param set.
 */
export const Route = createFileRoute("/tournament-register_/$num")({
  beforeLoad: ({ params }) => {
    const n = Number(params.num);
    throw redirect({
      to: "/tournament-register",
      search: Number.isFinite(n) ? { t: n } : {},
    });
  },
});
