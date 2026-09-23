import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, Eye, Loader2, RotateCcw, Save, Send } from "lucide-react";
import { useRoles } from "@/hooks/use-roles";
import {
  COMMON_PLACEHOLDERS,
  DEFAULTS,
  KIND_META,
  NOTIFICATION_KINDS,
  getNotificationTemplates,
  previewNotificationTemplate,
  saveNotificationTemplate,
  sendNotificationTest,
  type NotificationKind,
} from "@/lib/notification-email.functions";

export const Route = createFileRoute("/admin/notification-emails")({
  head: () => ({
    meta: [
      { title: "Notification Emails — Strategy Arena" },
      { name: "description", content: "Edit email templates for LFG, game results and news notifications." },
      { property: "og:title", content: "Notification Emails — Strategy Arena" },
      { property: "og:description", content: "Edit email templates for LFG, game results and news notifications." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotificationEmails,
});

type Tpl = { subject: string; previewText: string; text: string; html: string };

function NotificationEmails() {
  const roles = useRoles();
  const load = useServerFn(getNotificationTemplates);
  const save = useServerFn(saveNotificationTemplate);
  const preview = useServerFn(previewNotificationTemplate);
  const sendTest = useServerFn(sendNotificationTest);

  const [kind, setKind] = useState<NotificationKind>("lfg_live");
  const [all, setAll] = useState<Record<NotificationKind, Tpl>>({ ...DEFAULTS });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"" | "save" | "preview" | "send">("");
  const [testEmail, setTestEmail] = useState("");
  const [previewData, setPreviewData] = useState<Tpl | null>(null);

  useEffect(() => {
    if (roles.loading || !roles.isAdmin) return;
    load()
      .then((r) => {
        setAll(r.templates);
        setTestEmail(r.adminEmail ?? "");
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Could not load templates"))
      .finally(() => setLoading(false));
  }, [roles.loading, roles.isAdmin, load]);

  if (roles.loading) return null;
  if (!roles.isAdmin)
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="container mx-auto px-4 py-10 text-muted-foreground">Main admin only.</div>
      </div>
    );

  const tpl = all[kind];
  const set = (patch: Partial<Tpl>) => setAll((p) => ({ ...p, [kind]: { ...p[kind], ...patch } }));
  const payload = { kind, ...tpl };

  const run = async (b: typeof busy, fn: () => Promise<void>) => {
    setBusy(b);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto px-4 py-10 max-w-4xl space-y-6">
        <Link to="/admin/tournaments" className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:text-sand">
          <ArrowLeft className="size-4" /> Back to tournaments
        </Link>
        <h1 className="font-display text-3xl">Notification emails</h1>
        <p className="text-muted-foreground text-sm">
          Default templates for other notifications. Previews and test emails use example data.
        </p>

        <Card className="p-5 space-y-4 bg-card/70">
          <div>
            <Label>Notification type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as NotificationKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {NOTIFICATION_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>{KIND_META[k].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap gap-1">
            {[...KIND_META[kind].placeholders, ...COMMON_PLACEHOLDERS].map((p) => (
              <code key={p} className="text-xs rounded bg-muted px-1.5 py-0.5">{`{{${p}}}`}</code>
            ))}
          </div>

          {loading ? (
            <Loader2 className="size-5 animate-spin text-sand" />
          ) : (
            <>
              <div><Label>Subject</Label><Input value={tpl.subject} onChange={(e) => set({ subject: e.target.value })} /></div>
              <div><Label>Preview text</Label><Input value={tpl.previewText} onChange={(e) => set({ previewText: e.target.value })} /></div>
              <div>
                <Label>Plain text</Label>
                <Textarea rows={8} className="font-mono text-xs" spellCheck={false} value={tpl.text} onChange={(e) => set({ text: e.target.value })} />
              </div>
              <div>
                <Label>HTML</Label>
                <Textarea rows={16} className="font-mono text-xs" spellCheck={false} value={tpl.html} onChange={(e) => set({ html: e.target.value })} />
              </div>
              <button type="button" className="text-xs text-muted-foreground hover:text-sand inline-flex items-center gap-1" onClick={() => set(DEFAULTS[kind])}>
                <RotateCcw className="size-3" /> Reset to built-in design
              </button>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={!!busy} onClick={() => run("preview", async () => setPreviewData(await preview({ data: payload })))}>
                  <Eye className="size-4" /> Preview
                </Button>
                <Button disabled={!!busy} onClick={() => run("save", async () => { await save({ data: payload }); toast.success("Template saved"); })}>
                  <Save className="size-4" /> Save as default template
                </Button>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-border/60">
                <Input value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="Test email address" />
                <Button variant="outline" disabled={!!busy || !testEmail} onClick={() => run("send", async () => { await sendTest({ data: { ...payload, test_email: testEmail } }); toast.success("Test email sent"); })}>
                  <Send className="size-4" /> Send test email
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>

      <Dialog open={!!previewData} onOpenChange={(o) => !o && setPreviewData(null)}>
        <DialogContent className="max-w-3xl max-h-[85dvh] flex flex-col">
          <DialogHeader><DialogTitle>{previewData?.subject}</DialogTitle></DialogHeader>
          <div className="overflow-y-auto space-y-3">
            <p className="text-xs text-muted-foreground">Inbox preview: {previewData?.previewText}</p>
            <iframe title="Email preview" srcDoc={previewData?.html} className="w-full h-[500px] rounded border border-border" />
            <details><summary className="text-sm cursor-pointer">Plain text</summary><pre className="text-xs whitespace-pre-wrap">{previewData?.text}</pre></details>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
