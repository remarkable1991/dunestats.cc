import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Megaphone, Send, Inbox } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { queueNewsBroadcast } from "@/lib/notification-email.functions";
import { dispatchOutboxNow, getOutboxStatus } from "@/lib/email-outbox.functions";

type Tpl = { subject: string; previewText: string; text: string; html: string };

export function NewsBroadcastCard({ template }: { template: Tpl }) {
  const broadcast = useServerFn(queueNewsBroadcast);
  const status = useServerFn(getOutboxStatus);
  const dispatch = useServerFn(dispatchOutboxNow);
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState<{ pending: number; sentLast24h: number; dailyLimit: number } | null>(null);

  const refresh = useCallback(() => {
    status().then(setQ).catch(() => {});
  }, [status]);
  useEffect(refresh, [refresh]);

  const publish = async () => {
    if (!confirm(sendEmail ? "Publish this news and queue emails to all opted-in players?" : "Publish this news as a site pop-up?")) return;
    setBusy(true);
    try {
      const r = await broadcast({
        data: { kind: "general_news", ...template, headline, body, cta_label: ctaLabel, cta_url: ctaUrl, send_email: sendEmail },
      });
      toast.success("News published", {
        description: sendEmail ? `${r.queued} emails queued (max 80/day).` : "Shown as a pop-up for 7 days.",
      });
      setHeadline(""); setBody(""); setCtaLabel(""); setCtaUrl("");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not publish");
    } finally {
      setBusy(false);
    }
  };

  const sendNow = async () => {
    setBusy(true);
    try {
      const r = await dispatch();
      toast.success(`Sent ${r.sent} emails`, { description: r.budget === 0 ? "Daily limit already reached." : undefined });
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sending failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card className="p-5 space-y-4 bg-card/70">
        <h2 className="font-display text-xl flex items-center gap-2"><Megaphone className="size-5 text-sand" /> Send news</h2>
        <p className="text-sm text-muted-foreground">Shows as a pop-up for signed-in players for 7 days, and optionally emails everyone who has news emails on. Uses the General news template above.</p>
        <div><Label>Headline</Label><Input value={headline} onChange={(e) => setHeadline(e.target.value)} /></div>
        <div><Label>Message</Label><Textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} /></div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><Label>Button label (optional)</Label><Input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} /></div>
          <div><Label>Button link (optional)</Label><Input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://dunestats.cc/..." /></div>
        </div>
        <label className="flex items-center gap-2 text-sm"><Switch checked={sendEmail} onCheckedChange={setSendEmail} /> Also send as email</label>
        <Button disabled={busy || !headline.trim() || !body.trim()} onClick={publish}><Send className="size-4" /> Publish news</Button>
      </Card>

      <Card className="p-5 space-y-3 bg-card/70">
        <h2 className="font-display text-xl flex items-center gap-2"><Inbox className="size-5 text-sand" /> Email queue</h2>
        <p className="text-sm text-muted-foreground">Bulk emails send automatically each day at 12:00 UTC, at most {q?.dailyLimit ?? 80} per 24 hours.</p>
        <div className="flex gap-6 text-sm">
          <div><div className="text-2xl font-semibold">{q?.pending ?? "–"}</div>waiting</div>
          <div><div className="text-2xl font-semibold">{q ? `${q.sentLast24h}/${q.dailyLimit}` : "–"}</div>sent last 24h</div>
        </div>
        <Button variant="outline" disabled={busy || !q?.pending} onClick={sendNow}>Send next batch now</Button>
      </Card>
    </>
  );
}
