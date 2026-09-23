import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, MailX } from "lucide-react";
import { unsubscribeWithToken } from "@/lib/unsubscribe.functions";

type Search = { uid?: string; token?: string };

export const Route = createFileRoute("/unsubscribe")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    uid: typeof search["uid"] === "string" ? search["uid"] : undefined,
    token: typeof search["token"] === "string" ? search["token"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Email preferences — Strategy Arena" },
      { name: "description", content: "Stop receiving tournament announcement emails from Strategy Arena." },
      { property: "og:title", content: "Email preferences — Strategy Arena" },
      { property: "og:description", content: "Stop receiving tournament announcement emails from Strategy Arena." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Unsubscribe,
});

function Unsubscribe() {
  const { uid, token } = Route.useSearch();
  const run = useServerFn(unsubscribeWithToken);
  const [state, setState] = useState<"loading" | "done" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!uid || !token) {
        setState("error");
        setMessage("This unsubscribe link is incomplete.");
        return;
      }
      try {
        const res = await run({ data: { uid, token } });
        if (cancelled) return;
        if (res.ok) setState("done");
        else {
          setState("error");
          setMessage(res.error);
        }
      } catch (e) {
        if (cancelled) return;
        setState("error");
        setMessage(e instanceof Error ? e.message : "Something went wrong.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, token, run]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="p-8 max-w-md w-full text-center space-y-4">
        <MailX className="size-8 text-sand mx-auto" />
        <h1 className="font-display text-2xl">Tournament emails</h1>
        {state === "loading" && (
          <p className="text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="size-4 animate-spin" /> Updating your preferences…
          </p>
        )}
        {state === "done" && (
          <p className="text-muted-foreground">
            You will no longer receive tournament announcement emails. You can turn them back on any time on your
            profile page.
          </p>
        )}
        {state === "error" && <p className="text-destructive">{message}</p>}
        <Button asChild variant="outline">
          <a href="/profile">Go to my profile</a>
        </Button>
      </Card>
    </div>
  );
}
