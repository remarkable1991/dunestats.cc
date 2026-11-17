import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  CheckCircle2,
  Coffee,
  Copy,
  ExternalLink,
  Gift,
  Heart,
  Loader2,
  MessageCircle,
  ShieldCheck,
  Trophy,
  Users,
  Wrench,
} from "lucide-react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useRoles } from "@/hooks/use-roles";
import { getDonationSeasons, getPublicDonationBoard, submitDonation } from "@/lib/donations.functions";
import {
  DEFAULT_DONATION_ALLOCATION,
  approximateDonationUsd,
  DONATION_CURRENCIES,
  DONATION_PAYMENT_METHODS,
  donationPaymentMethodLabel,
  formatDonationMoney,
  makeDonationPaymentNote,
  type DonationCurrency,
  type DonationPaymentMethod,
  type PublicDonationRow,
} from "@/lib/donations";

const PAYPAL_URL = "https://paypal.me/StategyArena";
const REVOLUT_URL = "https://revolut.me/strategyarena";
const DISCORD_URL = "https://discord.gg/XuvUmtcSDQ";

const seasonQueryOptions = queryOptions({
  queryKey: ["donation-seasons"],
  queryFn: () => getDonationSeasons(),
});

function boardQueryOptions(seasonId: number | null) {
  return queryOptions({
    queryKey: ["public-donation-board", seasonId],
    queryFn: () => getPublicDonationBoard({ data: { seasonId } }),
  });
}

export const Route = createFileRoute("/support")({
  ssr: false,
  loader: ({ context }) => Promise.all([
    context.queryClient.ensureQueryData(seasonQueryOptions),
    context.queryClient.ensureQueryData(boardQueryOptions(null)),
  ]),
  head: () => ({
    meta: [
      { title: "Support Strategy Arena · Donations & Community Rewards" },
      { name: "description", content: "Support Dune Imperium tournaments, season prizes and Strategy Arena development through PayPal or Revolut, and view the verified donor leaderboard." },
      { property: "og:title", content: "Support Strategy Arena · Help the Community Grow" },
      { property: "og:description", content: "Direct your contribution toward prizes, site maintenance or developer appreciation, with privacy choices you control." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SupportPage,
});

function SupportPage() {
  const { data: seasonData } = useSuspenseQuery(seasonQueryOptions);
  const roles = useRoles();
  const sendDonation = useServerFn(submitDonation);
  const [timeframe, setTimeframe] = useState<"all" | "season">("all");
  const [seasonId, setSeasonId] = useState<number | null>(seasonData.currentSeasonId);
  const [currency, setCurrency] = useState<DonationCurrency>("USD");
  const [amountInput, setAmountInput] = useState("50");
  const [allocation, setAllocation] = useState(DEFAULT_DONATION_ALLOCATION);
  const [donorName, setDonorName] = useState("");
  const [playerKey, setPlayerKey] = useState<string | null>(null);
  const [claimedPlayers, setClaimedPlayers] = useState<Array<{ player_key: string; display_name: string }>>([]);
  const [paymentMethod, setPaymentMethod] = useState<DonationPaymentMethod>("paypal");
  const [hideName, setHideName] = useState(false);
  const [hideAmount, setHideAmount] = useState(false);
  const [donorNote, setDonorNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const amount = Number(amountInput) || 0;
  const paymentNote = useMemo(() => makeDonationPaymentNote({
    amount,
    currency,
    allocation,
    donorName: donorName || "Your IGN",
  }), [amount, currency, allocation, donorName]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) return;
      const { data } = await supabase
        .from("player_ratings")
        .select("player_key,display_name")
        .eq("claimed_by", userId)
        .eq("game_version", "overall")
        .order("games_played", { ascending: false });
      if (!active || !data?.length) return;
      setClaimedPlayers(data);
      setPlayerKey(data[0].player_key);
      setDonorName((current) => current || data[0].display_name);
    })();
    return () => { active = false; };
  }, []);

  const copyPaymentNote = async () => {
    try {
      await navigator.clipboard.writeText(paymentNote);
      toast.success("Payment note copied");
    } catch {
      toast.error("Could not copy automatically — select the note and copy it manually");
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (amount <= 0 || donorName.trim().length < 2) {
      toast.error("Enter your donor name and a valid amount");
      return;
    }
    setBusy(true);
    setSubmitted(false);
    try {
      await sendDonation({ data: {
        donorName,
        playerKey,
        amount,
        currency,
        allocation,
        hideName,
        hideAmount,
        paymentMethod,
        donorNote: donorNote || null,
      } });
      setSubmitted(true);
      setDonorNote("");
      toast.success("Thanks! Your donation is awaiting verification");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Your donation could not be submitted");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main>
        <section className="border-b border-border/50 bg-gradient-to-b from-primary/10 to-transparent">
          <div className="container mx-auto max-w-6xl px-4 py-12 text-center sm:py-16">
            <Badge variant="outline" className="mb-4 border-primary/40 bg-primary/10 px-3 py-1 text-primary">
              <Heart className="mr-1.5 size-3.5" /> Support Strategy Arena
            </Badge>
            <h1 className="mx-auto max-w-3xl font-display text-4xl leading-tight text-foreground sm:text-5xl">
              Help great minds compete.<br /><span className="text-gradient-sand">Help the arena grow.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
              Contributions support tournament prizes, season awards and general improvements across Strategy Arena.
              They also help cover roughly <span className="text-foreground">$50 a month</span> in hosting, domains and development costs.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg" onClick={() => setPaymentMethod("paypal")}>
                <a href={PAYPAL_URL} target="_blank" rel="noopener noreferrer">Donate with PayPal <ExternalLink className="size-4" /></a>
              </Button>
              <Button asChild size="lg" variant="outline" onClick={() => setPaymentMethod("revolut")}>
                <a href={REVOLUT_URL} target="_blank" rel="noopener noreferrer">Donate with Revolut <ExternalLink className="size-4" /></a>
              </Button>
              {roles.isAdmin ? <Button asChild size="lg" variant="ghost"><Link to="/admin/donations">Review donations</Link></Button> : null}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">PayPal and Revolut open in a new tab. No card details are handled by DuneStats.</p>
          </div>
        </section>

        <div className="container mx-auto max-w-6xl space-y-12 px-4 py-10">
          <section className="grid gap-4 md:grid-cols-3">
            <Perk icon={BadgeCheck} title="Discord donator role" text="Receive the @💸Donator🪙 role after your contribution is confirmed." />
            <Perk icon={MessageCircle} title="Custom Discord emoji" text="Donators can submit an idea for a new custom server emoji." />
            <Perk icon={Trophy} title="Player profile badge" text="Public supporters with a linked player profile receive a Donator badge." />
          </section>

          <section className="grid items-start gap-6 lg:grid-cols-[1.05fr_.95fr]">
            <Card className="border-primary/25 bg-card/75 p-5 shadow-arena sm:p-6">
              <div className="mb-6">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Direct your support</p>
                <h2 className="mt-2 font-display text-2xl">Choose where it helps</h2>
                <p className="mt-2 text-sm text-muted-foreground">Move any slider; the other two automatically balance to 100%.</p>
              </div>

              <div className="mb-6 grid gap-3 sm:grid-cols-[1fr_130px]">
                <div>
                  <Label htmlFor="donation-amount">Donation amount</Label>
                  <div className="mt-2 flex gap-2">
                    {[10, 25, 50, 100].map((value) => (
                      <Button key={value} type="button" size="sm" variant={amount === value ? "default" : "outline"} onClick={() => setAmountInput(String(value))}>
                        {value}
                      </Button>
                    ))}
                  </div>
                  <Input id="donation-amount" className="mt-2" type="number" min="0.01" max="1000000" step="0.01" value={amountInput} onChange={(event) => setAmountInput(event.target.value)} />
                </div>
                <div>
                  <Label>Currency</Label>
                  <Select value={currency} onValueChange={(value) => setCurrency(value as DonationCurrency)}>
                    <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                    <SelectContent>{DONATION_CURRENCIES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              <DonationAllocationControls amount={amount} currency={currency} value={allocation} onChange={setAllocation} />

              <div className="mt-6 rounded-lg border border-border/60 bg-background/50 p-4">
                <Label htmlFor="payment-note">Copy this into your transfer note</Label>
                <Textarea id="payment-note" readOnly value={paymentNote} className="mt-2 min-h-24 text-xs" />
                <Button type="button" variant="outline" size="sm" className="mt-3" onClick={copyPaymentNote} disabled={amount <= 0 || donorName.trim().length < 2}>
                  <Copy className="size-4" /> Copy payment note
                </Button>
                {donorName.trim().length < 2 ? <p className="mt-2 text-xs text-muted-foreground">Add your donor name in the form to enable copying.</p> : null}
              </div>
            </Card>

            <Card className="bg-card/70 p-5 sm:p-6">
              <div className="mb-5">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal">After you donate</p>
                <h2 className="mt-2 font-display text-2xl">Tell us it arrived</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Submit before or after paying. Your contribution appears publicly only after an admin verifies receipt.</p>
              </div>

              {submitted ? (
                <div className="mb-5 flex gap-3 rounded-lg border border-teal/40 bg-teal/10 p-4 text-sm">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-teal" />
                  <div><p className="font-medium text-foreground">Thank you for supporting the arena.</p><p className="mt-1 text-muted-foreground">Your submission is pending verification. It will not appear on the leaderboard yet.</p></div>
                </div>
              ) : null}

              <form className="space-y-4" onSubmit={submit}>
                <div>
                  <Label htmlFor="donor-name">Player or Discord name</Label>
                  <Input id="donor-name" required minLength={2} maxLength={80} value={donorName} onChange={(event) => setDonorName(event.target.value)} placeholder="The name we should recognize" />
                </div>
                {claimedPlayers.length ? (
                  <div>
                    <Label>Linked player profile</Label>
                    <Select value={playerKey ?? "none"} onValueChange={(value) => {
                      const next = value === "none" ? null : value;
                      setPlayerKey(next);
                      const claimed = claimedPlayers.find((player) => player.player_key === next);
                      if (claimed) setDonorName(claimed.display_name);
                    }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No profile link</SelectItem>
                        {claimedPlayers.map((player) => <SelectItem key={player.player_key} value={player.player_key}>{player.display_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <p className="mt-1 text-xs text-muted-foreground">A verified, non-anonymous donation adds the Donator badge here.</p>
                  </div>
                ) : null}
                <div>
                  <Label>How did you contribute?</Label>
                  <Select value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as DonationPaymentMethod)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{DONATION_PAYMENT_METHODS.map((method) => <SelectItem key={method} value={method}>{donationPaymentMethodLabel(method)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="donor-note">Payment reference or note <span className="text-muted-foreground">(admin only)</span></Label>
                  <Textarea id="donor-note" maxLength={500} value={donorNote} onChange={(event) => setDonorNote(event.target.value)} placeholder="Optional: transaction date, reference, or anything that helps us match your payment" />
                </div>
                <div className="space-y-3 rounded-lg border border-border/50 bg-background/35 p-4">
                  <p className="text-sm font-medium">Leaderboard privacy</p>
                  <div className="flex items-start justify-between gap-4">
                    <Label htmlFor="hide-name" className="cursor-pointer text-sm font-normal"><span className="block">Hide my name</span><span className="mt-0.5 block text-xs text-muted-foreground">Show “Anonymous Donor” and remove the profile link and badge.</span></Label>
                    <Switch id="hide-name" checked={hideName} onCheckedChange={setHideName} />
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <Label htmlFor="hide-amount" className="cursor-pointer text-sm font-normal"><span className="block">Hide my amount</span><span className="mt-0.5 block text-xs text-muted-foreground">Appear as a verified supporter without an amount or rank.</span></Label>
                    <Switch id="hide-amount" checked={hideAmount} onCheckedChange={setHideAmount} />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={busy || amount <= 0}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Heart className="size-4" />}
                  Submit for verification
                </Button>
              </form>
              <div className="mt-5 rounded-lg bg-secondary/35 p-3 text-xs leading-relaxed text-muted-foreground">
                Prefer Steam keys or digital gift cards? <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Contact us on Discord</a>. These contributions are also added after manual verification.
              </div>
            </Card>
          </section>

          <section>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Community transparency</p>
                <h2 className="mt-2 font-display text-3xl">Verified supporters</h2>
                <p className="mt-2 text-sm text-muted-foreground">Every confirmed contribution appears together. Rankings use approximate USD values; original amounts stay unchanged.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Tabs value={timeframe} onValueChange={(value) => setTimeframe(value as "all" | "season")}>
                  <TabsList><TabsTrigger value="all">All time</TabsTrigger><TabsTrigger value="season" disabled={!seasonData.seasons.length}>By season</TabsTrigger></TabsList>
                </Tabs>
                {timeframe === "season" ? (
                  <Select value={seasonId == null ? "" : String(seasonId)} onValueChange={(value) => setSeasonId(Number(value))}>
                    <SelectTrigger className="w-44"><SelectValue placeholder="Season" /></SelectTrigger>
                    <SelectContent>{seasonData.seasons.map((season) => <SelectItem key={season.id} value={String(season.id)}>{season.name}</SelectItem>)}</SelectContent>
                  </Select>
                ) : null}
              </div>
            </div>
            <Suspense fallback={<Card className="flex min-h-64 items-center justify-center"><Loader2 className="size-6 animate-spin text-primary" /></Card>}>
              <DonationBoard seasonId={timeframe === "season" ? seasonId : null} />
            </Suspense>
          </section>
        </div>
      </main>
    </div>
  );
}

function Perk({ icon: Icon, title, text }: { icon: typeof Gift; title: string; text: string }) {
  return <Card className="bg-card/55 p-5"><Icon className="size-6 text-primary" /><h2 className="mt-3 font-display text-base">{title}</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p></Card>;
}

function DonationBoard({ seasonId }: { seasonId: number | null }) {
  const { data } = useSuspenseQuery(boardQueryOptions(seasonId));
  const rows = data.rows as PublicDonationRow[];
  const summary = Object.fromEntries(Object.entries(data.summary).map(([key, value]) => [key, Number(value)]));
  const monthly = summary.monthly_maintenance ?? 0;
  const money = (value: number) => formatDonationMoney(value, "USD");

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-card/60 p-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground"><Wrench className="size-4 text-teal" /> This month’s maintenance</div>
          <p className="mt-3 font-display text-2xl text-foreground">{money(monthly)}<span className="ml-1 text-sm text-muted-foreground">/ $50.00</span></p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-teal" style={{ width: `${Math.min(100, (monthly / 50) * 100)}%` }} /></div>
          <p className="mt-2 text-xs text-muted-foreground">Approximate USD from verified maintenance allocations</p>
        </Card>
        <Card className="bg-card/60 p-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground"><Trophy className="size-4 text-primary" /> Rewards funded</div>
          <p className="mt-3 font-display text-2xl text-foreground">{money(summary.tournament_total ?? 0)}</p>
          <p className="mt-2 text-xs text-muted-foreground">Tournament and season allocation · {money(summary.total_amount ?? 0)} total support</p>
        </Card>
        <Card className="bg-card/60 p-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground"><Users className="size-4 text-coral" /> Community supporters</div>
          <p className="mt-3 font-display text-2xl text-foreground">{summary.supporter_count ?? 0}</p>
          <p className="mt-2 text-xs text-muted-foreground">{summary.donation_count ?? 0} verified {summary.donation_count === 1 ? "contribution" : "contributions"}</p>
        </Card>
      </div>

      <Card className="overflow-hidden border-border/60 bg-card/65 p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="bg-secondary/35 text-xs uppercase tracking-wider text-muted-foreground"><th className="w-16 px-4 py-3 text-left">Rank</th><th className="px-4 py-3 text-left">Donor</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3 text-left">Allocation</th><th className="px-4 py-3 text-right">Date</th></tr></thead>
            <tbody>
              {!rows.length ? <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">No verified donations in this view yet. Yours could be the first.</td></tr> : null}
              {rows.map((row) => <DonationRow key={row.donation_id} row={row} />)}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="space-y-2 text-xs text-muted-foreground">
        <p>Totals and ranks use fixed reference rates: €1 ≈ $1.08 and £1 ≈ $1.28. These are approximate ranking values, not live exchange quotes.</p>
        <p className="flex items-center gap-2"><ShieldCheck className="size-4 text-teal" /> Hidden amounts are never sent to the public page and are excluded from numbered ranks.</p>
      </div>
    </div>
  );
}

function DonationRow({ row }: { row: PublicDonationRow }) {
  const rankStyle = row.donor_rank === 1 ? "border-primary/50 bg-primary/15 text-primary" : row.donor_rank === 2 ? "border-teal/50 bg-teal/10 text-teal" : row.donor_rank === 3 ? "border-coral/50 bg-coral/10 text-coral" : "border-border/60 text-muted-foreground";
  return (
    <tr className="border-t border-border/40 hover:bg-secondary/20">
      <td className="px-4 py-4">{row.donor_rank ? <span className={`inline-flex size-8 items-center justify-center rounded-full border font-display text-sm ${rankStyle}`}>{row.donor_rank}</span> : <span className="pl-2 text-muted-foreground">—</span>}</td>
      <td className="px-4 py-4">
        <div className="flex items-center gap-2">
          {row.player_key ? <Link to="/players/$key" params={{ key: row.player_key }} className="font-medium text-foreground hover:text-primary hover:underline">{row.display_name}</Link> : <span className="font-medium">{row.display_name}</span>}
          {row.amount_hidden ? <Badge variant="outline" className="text-[10px]">Verified supporter</Badge> : null}
        </div>
      </td>
      <td className="px-4 py-4 text-right font-display text-base tabular-nums text-primary">
        {row.amount == null ? "Hidden" : <>
          {formatDonationMoney(Number(row.amount), row.currency)}
          {row.currency !== "USD" ? <span className="mt-0.5 block text-xs font-normal text-muted-foreground">≈ {formatDonationMoney(approximateDonationUsd(Number(row.amount), row.currency), "USD")}</span> : null}
        </>}
      </td>
      <td className="px-4 py-4"><div className="flex flex-wrap gap-1.5 text-[11px]"><Badge variant="outline" className="border-primary/30 text-primary"><Trophy className="mr-1 size-3" />{row.tournament_pct}%</Badge><Badge variant="outline" className="border-teal/30 text-teal"><Wrench className="mr-1 size-3" />{row.maintenance_pct}%</Badge><Badge variant="outline" className="border-coral/30 text-coral"><Coffee className="mr-1 size-3" />{row.developer_pct}%</Badge></div></td>
      <td className="px-4 py-4 text-right text-xs text-muted-foreground">{new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(row.donated_at))}</td>
    </tr>
  );
}
