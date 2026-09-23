import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, Eye, Loader2, Mail, RotateCcw, Save, Send } from "lucide-react";
import { fetchTournaments, type TournamentConfig } from "@/lib/tournaments";
import {
  DEFAULT_HTML,
  DEFAULT_SUBJECT,
  getTournamentEmailSetup,
  previewTournamentEmail,
  saveTournamentTemplate,
  sendTournamentEmail,
} from "@/lib/tournament-email.functions";

export const Route = createFileRoute("/admin/tournament-emails")({
  head: () => ({
    meta: [
      { title: "Tournament Emails — Strategy Arena" },
      { name: "description", content: "Compose, preview and send tournament announcement emails." },
      { property: "og:title", content: "Tournament Emails — Strategy Arena" },
      { property: "og:description", content: "Compose, preview and send tournament announcement emails." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TournamentEmails,
});

const PLACEHOLDERS = [
  "tournament_num",
  "tournament_name",
  "info_title",
  "info_text",
  "prizes_block",
  "prizes_summary",
  "prizes_text",
  "format",
  "start_date",
  "end_date",
  "logo_url",
  "site_url",
  "register_url",
  "profile_url",
  "year",
];

type Audience = "test" | "subscribed" | "all";

function TournamentEmails() {
  const loadSetup = useServerFn(getTournamentEmailSetup);
  const saveTpl = useServerFn(saveTournamentTemplate);
  const preview = useServerFn(previewTournamentEmail);
  const send = useServerFn(sendTournamentEmail);

  const [loading, setLoading] = useState(true);
  const [tournaments, setTournaments] = useState<TournamentConfig[]>([]);
  const [num, setNum] = useState<string>("");
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [html, setHtml] = useState(DEFAULT_HTML);
  const [counts, setCounts] = useState({ all: 0, subscribed: 0 });
  const [testEmail, setTestEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState<{ subject: string; html: string } | null>(null);
  const [confirm, setConfirm] = useState<Audience | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [list, setup] = await Promise.all([fetchTournaments(), loadSetup({ data: {} } as never)]);
        if (cancelled) return;
        setTournaments(list);
        setNum(list.length > 0 ? String(list[0].tournament_num) : "");
        setSubject(setup.subject);
        setHtml(setup.html);
        setCounts(setup.counts);
        setTestEmail(setup.adminEmail ?? "");
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Could not load email settings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSetup]);

  const selected = useMemo(
    () => tournaments.find((t) => String(t.tournament_num) === num) ?? null,
    [tournaments, num],
  );

  async function onSave() {
    setSaving(true);
    try {
      await saveTpl({ data: { subject, html } });
      toast.success("Template saved as the default");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the template");
    } finally {
      setSaving(false);
    }
  }

  async function onPreview() {
    if (!selected) return toast.error("Pick a tournament first");
    setPreviewing(true);
    try {
      const res = await preview({ data: { tournament_num: selected.tournament_num, subject, html } });
      setPreviewData(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not build the preview");
    } finally {
      setPreviewing(false);
    }
  }

  async function onSend(audience: Audience) {
    if (!selected) return;
    setSending(true);
    try {
      const res = await send({
        data: {
          tournament_num: selected.tournament_num,
          subject,
          html,
          audience,
          test_email: audience === "test" ? testEmail || undefined : undefined,
        },
      });
      if (res.failed > 0) toast.error(`Sent ${res.sent}, failed ${res.failed}. ${res.error ?? ""}`);
      else toast.success(audience === "test" ? "Test email sent" : `Sent to ${res.sent} people`);
      setConfirm(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sending failed");
    } finally {
      setSending(false);
    }
  }

  const audienceCount = (a: Audience) => (a === "test" ? 1 : a === "all" ? counts.all : counts.subscribed);

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto px-4 py-6 max-w-4xl space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="font-display text-2xl sm:text-3xl flex items-center gap-2">
            <Mail className="size-6 text-sand" /> Tournament emails
          </h1>
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin/tournaments">
              <ArrowLeft className="size-4 mr-1" />
              Back to tournaments
            </Link>
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <Card className="p-4 space-y-4">
              <div className="space-y-1.5">
                <Label>Tournament</Label>
                <Select value={num} onValueChange={setNum}>
                  <SelectTrigger className="max-w-md">
                    <SelectValue placeholder="Pick a tournament" />
                  </SelectTrigger>
                  <SelectContent>
                    {tournaments.map((t) => (
                      <SelectItem key={t.tournament_num} value={String(t.tournament_num)}>
                        #{t.tournament_num} — {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  The tournament's own information, prizes, dates and format are filled into the email.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Subject</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <Label>Email HTML</Label>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-sand"
                    onClick={() => {
                      setSubject(DEFAULT_SUBJECT);
                      setHtml(DEFAULT_HTML);
                    }}
                  >
                    <RotateCcw className="size-3.5 mr-1" /> Reset to built-in design
                  </Button>
                </div>
                <Textarea
                  value={html}
                  onChange={(e) => setHtml(e.target.value)}
                  className="font-mono text-xs min-h-[320px]"
                  spellCheck={false}
                />
                <p className="text-xs text-muted-foreground">
                  Placeholders:{" "}
                  {PLACEHOLDERS.map((p) => (
                    <code key={p} className="mr-1 rounded bg-muted px-1 py-0.5">{`{{${p}}}`}</code>
                  ))}
                </p>
              </div>

              <div className="flex gap-2 flex-wrap">
                <Button onClick={onPreview} variant="outline" disabled={previewing || !selected}>
                  {previewing ? <Loader2 className="size-4 animate-spin mr-1" /> : <Eye className="size-4 mr-1" />}
                  Preview
                </Button>
                <Button onClick={onSave} disabled={saving} className="bg-sand text-background hover:bg-sand/90">
                  {saving ? <Loader2 className="size-4 animate-spin mr-1" /> : <Save className="size-4 mr-1" />}
                  Save as default template
                </Button>
              </div>
            </Card>

            <Card className="p-4 space-y-4">
              <h2 className="font-display text-lg">Send</h2>
              <div className="space-y-1.5 max-w-md">
                <Label>Test address</Label>
                <Input value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="you@example.com" />
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <Button variant="outline" disabled={!selected} onClick={() => setConfirm("test")}>
                  <Send className="size-4 mr-1" /> Test email (1)
                </Button>
                <Button variant="outline" disabled={!selected} onClick={() => setConfirm("subscribed")}>
                  <Send className="size-4 mr-1" /> Subscribed ({counts.subscribed})
                </Button>
                <Button variant="outline" disabled={!selected} onClick={() => setConfirm("all")}>
                  <Send className="size-4 mr-1" /> Everyone ({counts.all})
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Everyone with an account is subscribed by default; players who turn tournament emails off are skipped in
                the subscribed option.
              </p>
            </Card>
          </>
        )}
      </div>

      <Dialog open={!!previewData} onOpenChange={(o) => !o && setPreviewData(null)}>
        <DialogContent className="max-w-3xl max-h-[85dvh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="font-display">Preview</DialogTitle>
            <DialogDescription>{previewData?.subject}</DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto rounded-md border border-border">
            <iframe title="Email preview" srcDoc={previewData?.html ?? ""} className="w-full h-[60vh] bg-white" />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Send this email?</DialogTitle>
            <DialogDescription>
              {confirm === "test"
                ? `A single test email goes to ${testEmail || "your account address"}.`
                : `This will email ${audienceCount(confirm ?? "subscribed")} people about tournament #${
                    selected?.tournament_num ?? ""
                  }.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)} disabled={sending}>
              Cancel
            </Button>
            <Button
              className="bg-sand text-background hover:bg-sand/90"
              disabled={sending}
              onClick={() => confirm && onSend(confirm)}
            >
              {sending ? <Loader2 className="size-4 animate-spin mr-1" /> : <Send className="size-4 mr-1" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
