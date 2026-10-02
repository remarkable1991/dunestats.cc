import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type News = { id: string; headline: string; body: string; cta_label: string | null; cta_url: string | null; created_at: string };

/** Shows news posts from the last 7 days once per player until dismissed. */
export function NewsPopup({ userId, blocked }: { userId: string; blocked: boolean }) {
  const [items, setItems] = useState<News[]>([]);

  useEffect(() => {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    Promise.all([
      (supabase as any).from("news_posts").select("*").gte("created_at", since).order("created_at"),
      supabase.from("user_dismissed_notifications").select("reference_id").eq("user_id", userId).eq("notification_type", "news"),
    ]).then(([n, d]) => {
      const seen = new Set((d.data ?? []).map((r: any) => r.reference_id));
      setItems(((n.data ?? []) as News[]).filter((x) => !seen.has(x.id)));
    });
  }, [userId]);

  const current = items[0];
  const dismiss = () => {
    if (!current) return;
    setItems((p) => p.slice(1));
    void supabase.rpc("dismiss_user_notification", { p_notification_type: "news", p_reference_id: current.id });
  };

  return (
    <Dialog open={!blocked && !!current} onOpenChange={(o) => !o && dismiss()}>
      <DialogContent className="max-h-[85dvh] flex flex-col">
        {current ? (
          <>
            <DialogHeader className="shrink-0">
              <DialogTitle className="flex items-center gap-2">
                <Megaphone className="size-5 text-primary" />
                {current.headline}
              </DialogTitle>
              <DialogDescription>News · {new Date(current.created_at).toLocaleDateString()}</DialogDescription>
            </DialogHeader>
            <div className="overflow-y-auto pr-1 whitespace-pre-line text-sm leading-relaxed">{current.body}</div>
            <DialogFooter className="gap-2 sm:justify-between shrink-0">
              <Button variant="ghost" onClick={dismiss}>Got it</Button>
              {current.cta_url ? (
                <Button asChild onClick={dismiss}>
                  <a href={current.cta_url}>{current.cta_label || "Read more"}</a>
                </Button>
              ) : null}
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
