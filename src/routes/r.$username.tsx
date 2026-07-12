import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/r/$username")({
  ssr: false,
  component: ReferralLanding,
});

function ReferralLanding() {
  const { username } = Route.useParams();
  const navigate = useNavigate();

  useEffect(() => {
    try {
      const key = username.trim().toLowerCase();
      if (key) localStorage.setItem("sp_referrer", key);
    } catch {
      // ignore
    }
    navigate({ to: "/auth", replace: true });
  }, [username, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <p className="text-muted-foreground text-sm">Bringing you in from {username}…</p>
    </div>
  );
}
