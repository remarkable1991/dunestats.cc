import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { Check, ExternalLink, Heart, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Navbar } from "@/components/Navbar";
import { DonationAllocationControls } from "@/components/DonationAllocationControls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useRoles } from "@/hooks/use-roles";
import {
  createHistoricalDonation,
  listDonationsForAdmin,
  rejectDonation,
  verifyDonation,
} from "@/lib/donation-admin.functions";
import {
  DEFAULT_DONATION_ALLOCATION,
  DONATION_CURRENCIES,
  DONATION_PAYMENT_METHODS,
  donationPaymentMethodLabel,
  formatDonationMoney,
  type DonationCurrency,
  type DonationPaymentMethod,
} from "@/lib/donations";

export const Route = createFileRoute("/admin/donations")({
  head: () => ({
    meta: [
      { title: "Donation Review · Strategy Arena Admin" },
      { name: "description", content: "Verify community contributions and add historical Strategy Arena donations." },
      { property: "og:title", content: "Donation Review · Strategy Arena Admin" },
      { property: "og:description", content: "Main-admin donation verification and historical entry tools." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminDonations,
});

type DonationRow = {
  id: string;
  donor_name: string;
  player_key: string | null;
  amount: number;
  currency: string;
  tournament_pct: number;
  maintenance_pct: number;
  developer_pct: number;
  hide_name: boolean;
  hide_amount: boolean;
  payment_method: string;
  donor_note: string | null;
  status: "pending" | "verified" | "rejected";
  season_id: number | null;
  donated_at: string;
  created_at: string;
};
type AdminData = {
  donations: DonationRow[];
};

function localDateTimeValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function AdminDonations() {
  const roles = useRoles();
  const list = useServerFn(listDonationsForAdmin);
  const verify = useServerFn(verifyDonation);
  const reject = useServerFn(rejectDonation);
  const create = useServerFn(createHistoricalDonation);
  const [data, setData] = useState<AdminData | null>(null);
  const [busy, setBusy] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [donorName, setDonorName] = useState("");
  const [playerKey, setPlayerKey] = useState("");
  const [amountInput, setAmountInput] = useState("50");
  const [currency, setCurrency] = useState<DonationCurrency>("USD");
  const [allocation, setAllocation] = useState(DEFAULT_DONATION_ALLOCATION);
  const [paymentMethod, setPaymentMethod] = useState<DonationPaymentMethod>("paypal");
  const [donatedAt, setDonatedAt] = useState("");
  const [hideName, setHideName] = useState(false);
  const [hideAmount, setHideAmount] = useState(false);
  const [donorNote, setDonorNote] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setData(await list());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load donations");
    } finally {
      setBusy(false);
    }
  }, [list]);

  useEffect(() => {
    if (roles.isAdmin) void load();
  }, [roles.isAdmin, load]);

  useEffect(() => {
    if (showManual && !donatedAt) setDonatedAt(localDateTimeValue(new Date()));
  }, [showManual, donatedAt]);

  const review = async (id: string, action: "verify" | "reject") => {
    setBusy(true);
    try {
      if (action === "verify") {
        await verify({ data: { id } });
        toast.success("Donation verified and published");
      } else {
        await reject({ data: { id } });
        toast.success("Submission rejected; it remains private");
      }
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not review this donation");
    } finally {
      setBusy(false);
    }
  };

  const addHistorical = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await create({ data: {
        donorName,
        playerKey: playerKey || null,
        amount: Number(amountInput),
        currency,
        allocation,
        hideName,
        hideAmount,
        paymentMethod,
        donorNote: donorNote || null,
        donatedAt: new Date(donatedAt).toISOString(),
      } });
      toast.success("Historical donation added and verified");
      setDonorName("");
      setPlayerKey("");
      setDonorNote("");
      setShowManual(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add this donation");
    } finally {
      setBusy(false);
    }
  };

  if (roles.loading) return <div className="min-h-screen"><Navbar /><main className="container mx-auto px-4 py-12"><Loader2 className="size-6 animate-spin text-primary" /></main></div>;
  if (!roles.isAdmin) return <div className="min-h-screen"><Navbar /><main className="container mx-auto px-4 py-12 text-muted-foreground">Main admins only.</main></div>;

  const donations = data?.donations ?? [];
  const pending = donations.filter((donation) => donation.status === "pending");
  const reviewed = donations.filter((donation) => donation.status !== "pending");
  const amount = Number(amountInput) || 0;

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="container mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-primary">Community support</p>
            <h1 className="mt-2 font-display text-3xl">Donation review</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Compare pending submissions with PayPal or Revolut, then verify to publish. Rejected and pending entries never appear publicly.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild><Link to="/support">View Support page <ExternalLink className="size-4" /></Link></Button>
            <Button onClick={() => setShowManual((value) => !value)}><Plus className="size-4" /> Add previous donation</Button>
          </div>
        </div>

        {showManual ? (
          <Card className="border-primary/30 bg-card/70 p-5 sm:p-6">
            <h2 className="font-display text-xl">Add a verified historical donation</h2>
            <p className="mt-1 text-sm text-muted-foreground">Use the donor’s requested privacy settings. The season is assigned automatically from the donation date.</p>
            <form className="mt-5 space-y-5" onSubmit={addHistorical}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Donor name"><Input required minLength={2} maxLength={80} value={donorName} onChange={(event) => setDonorName(event.target.value)} /></Field>
                <Field label="Player key (optional)"><Input maxLength={100} value={playerKey} onChange={(event) => setPlayerKey(event.target.value)} placeholder="lowercase-profile-key" /></Field>
                <Field label="Donation date"><Input required type="datetime-local" value={donatedAt} onChange={(event) => setDonatedAt(event.target.value)} /></Field>
                <Field label="Amount"><Input required type="number" min="0.01" max="1000000" step="0.01" value={amountInput} onChange={(event) => setAmountInput(event.target.value)} /></Field>
                <Field label="Currency"><Select value={currency} onValueChange={(value) => setCurrency(value as DonationCurrency)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{DONATION_CURRENCIES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="Payment method"><Select value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as DonationPaymentMethod)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{DONATION_PAYMENT_METHODS.map((method) => <SelectItem key={method} value={method}>{donationPaymentMethodLabel(method)}</SelectItem>)}</SelectContent></Select></Field>
              </div>
              <DonationAllocationControls amount={amount} currency={currency} value={allocation} onChange={setAllocation} />
              <Field label="Private admin note"><Textarea maxLength={500} value={donorNote} onChange={(event) => setDonorNote(event.target.value)} /></Field>
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm"><Switch checked={hideName} onCheckedChange={setHideName} /> Hide donor name</label>
                <label className="flex items-center gap-2 text-sm"><Switch checked={hideAmount} onCheckedChange={setHideAmount} /> Hide amount and rank</label>
              </div>
              <div className="flex gap-2"><Button type="submit" disabled={busy || !donatedAt}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Save verified donation</Button><Button type="button" variant="ghost" onClick={() => setShowManual(false)}>Cancel</Button></div>
            </form>
          </Card>
        ) : null}

        <section className="space-y-4">
          <div className="flex items-center gap-3"><h2 className="font-display text-2xl">Pending verification</h2><Badge variant={pending.length ? "default" : "outline"}>{pending.length}</Badge>{busy ? <Loader2 className="size-4 animate-spin text-primary" /> : null}</div>
          {!pending.length ? <Card className="bg-card/50 p-8 text-center text-sm text-muted-foreground">No pending donations. New submissions will appear here.</Card> : null}
          {pending.map((donation) => (
            <Card key={donation.id} className="border-primary/30 bg-card/70 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-display text-xl">{donation.donor_name}</span><Badge variant="outline">{donationPaymentMethodLabel(donation.payment_method as DonationPaymentMethod)}</Badge>{donation.hide_name ? <Badge variant="outline">Anonymous publicly</Badge> : null}{donation.hide_amount ? <Badge variant="outline">Amount hidden</Badge> : null}</div>
                  <p className="text-2xl font-medium text-primary">{formatDonationMoney(Number(donation.amount), donation.currency as DonationCurrency)}</p>
                  <p className="text-xs text-muted-foreground">Submitted {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(donation.created_at))} UTC · Season {donation.season_id ?? "all-time only"}{donation.player_key ? ` · Player ${donation.player_key}` : ""}</p>
                </div>
                <div className="flex gap-2"><Button disabled={busy} onClick={() => void review(donation.id, "verify")}><Check className="size-4" /> Verify & publish</Button><Button disabled={busy} variant="outline" onClick={() => void review(donation.id, "reject")}><X className="size-4" /> Reject</Button></div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs"><Badge className="bg-primary/15 text-primary">{donation.tournament_pct}% rewards</Badge><Badge className="bg-teal/10 text-teal">{donation.maintenance_pct}% maintenance</Badge><Badge className="bg-coral/10 text-coral">{donation.developer_pct}% developer</Badge></div>
              {donation.donor_note ? <p className="mt-4 rounded-md bg-background/50 p-3 text-sm text-muted-foreground"><span className="text-foreground">Donor note:</span> {donation.donor_note}</p> : null}
            </Card>
          ))}
        </section>

        <section className="space-y-4">
          <h2 className="font-display text-2xl">Recent reviewed entries</h2>
          <Card className="overflow-hidden bg-card/55 p-0">
            <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead><tr className="bg-secondary/35 text-left text-xs uppercase tracking-wider text-muted-foreground"><th className="px-4 py-3">Donor</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Privacy</th><th className="px-4 py-3">Donated</th></tr></thead><tbody>
              {!reviewed.length ? <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No reviewed donations yet.</td></tr> : null}
              {reviewed.map((donation) => <tr key={donation.id} className="border-t border-border/40"><td className="px-4 py-3"><span className="font-medium">{donation.donor_name}</span><span className="block text-xs text-muted-foreground">{donation.player_key ?? "No player link"}</span></td><td className="px-4 py-3 text-primary">{formatDonationMoney(Number(donation.amount), donation.currency as DonationCurrency)}</td><td className="px-4 py-3"><Badge variant={donation.status === "verified" ? "default" : "outline"}>{donation.status}</Badge></td><td className="px-4 py-3 text-xs text-muted-foreground">{[donation.hide_name ? "name hidden" : null, donation.hide_amount ? "amount hidden" : null].filter(Boolean).join(", ") || "Public name & amount"}</td><td className="px-4 py-3 text-xs text-muted-foreground">{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(donation.donated_at))}</td></tr>)}
            </tbody></table></div>
          </Card>
        </section>

        <p className="flex items-center gap-2 text-xs text-muted-foreground"><Heart className="size-4 text-coral" /> Verification publishes the donation and any eligible public player badge. No payment credentials are stored here.</p>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}
