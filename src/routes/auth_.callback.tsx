import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/auth_/callback")({
  head: () => ({
    meta: [
      { title: "Signing you in…" },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: z.object({
    next: z.string().optional(),
    player: z.string().optional(),
  }),
  component: AuthCallback,
});

function isSafePath(path: string): boolean {
  // Only allow same-origin relative paths (no protocol, no //-prefixed URLs).
  return path.startsWith("/") && !path.startsWith("//");
}

function AuthCallback() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth_/callback" });

  useEffect(() => {
    let cancelled = false;

    const rawNext = search.next && isSafePath(search.next) ? search.next : undefined;
    const target = rawNext ?? (search.player ? "/claim" : "/upload");
    const targetSearch = search.player ? { player: search.player } : undefined;

    const goHome = (message?: string) => {
      if (cancelled) return;
      if (message) toast.error(message);
      if (targetSearch) {
        navigate({ to: target as "/claim", search: targetSearch, replace: true });
      } else {
        navigate({ to: target as "/upload", replace: true });
      }
    };

    const goAuth = (message?: string) => {
      if (cancelled) return;
      if (message) toast.error(message);
      navigate({
        to: "/auth",
        search: {
          ...(rawNext ? { next: rawNext } : {}),
          ...(search.player ? { player: search.player } : {}),
        },
        replace: true,
      });
    };

    (async () => {
      try {
        // supabase-js with detectSessionInUrl parses hash/query tokens automatically.
        // If a `code` param exists (PKCE), exchange it explicitly.
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const errorDescription =
          url.searchParams.get("error_description") ?? url.hash.match(/error_description=([^&]+)/)?.[1];

        if (errorDescription) {
          goAuth(decodeURIComponent(errorDescription));
          return;
        }

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            goAuth(error.message);
            return;
          }
        }

        const { data } = await supabase.auth.getSession();
        if (data.session) {
          goHome();
        } else {
          goAuth("Sign-in did not complete. Please try again.");
        }
      } catch (err) {
        goAuth(err instanceof Error ? err.message : "Sign-in failed");
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-pulse text-lg font-display mb-2">Completing sign-in…</div>
        <p className="text-sm text-muted-foreground">Hang tight while we return you to the Arena.</p>
      </div>
    </div>
  );
}
