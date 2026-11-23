import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/rewards/")({
  validateSearch: (search: Record<string, unknown>) => search,
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/rewards/$",
      params: { _splat: "seasonal" },
      search,
      replace: true,
    });
  },
});
