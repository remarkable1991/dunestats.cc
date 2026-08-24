import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { PrizesInfo } from "@/components/PrizesInfo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import {
  SLOTS_PER_DAY as SLOTS,
  type TournamentConfig,
  checkinStart,
  fetchOpenTournaments,
  fetchTournamentByNum,
  parseLocalDate,
  registrationClosesAt,
  tournamentDayCount,
  tournamentWeekCount,
} from "@/lib/tournaments";
import discordHint from "@/assets/discord-hint.png.asset.json";

/** e.g. "Europe/Berlin (GMT+02:00)" — IANA zone plus the exact current UTC offset. */
function resolveTimezoneLabel(): string | null {
  if (typeof Intl === "undefined") return null;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const offsetMin = -new Date().getTimezoneOffset();
  const sign = offsetMin < 0 ? "-" : "+";
  const abs = Math.abs(offsetMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  const gmt = `GMT${sign}${hh}:${mm}`;
  return zone ? `${zone} (${gmt})` : gmt;
}

export const Route = createFileRoute("/tournament-register")({
  validateSearch: (search: Record<string, unknown>): { t?: number } => ({
    t: search.t != null && Number.isFinite(Number(search.t)) ? Number(search.t) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Tournament Registration · Strategy Arena" },
      { name: "description", content: "Sign up for the next Strategy Arena Dune Imperium tournament." },
      { property: "og:title", content: "Tournament Registration · Strategy Arena" },
      { property: "og:description", content: "Sign up for the next Strategy Arena Dune Imperium tournament." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RegisterPage,
});

// ---------- Grid math ----------
function blockId(day: number, slot: number) { return day * SLOTS + slot; }
function dayOfBlock(id: number) { return Math.floor(id / SLOTS); }
function slotOfBlock(id: number) { return id % SLOTS; }

/** dayOfWeek where Monday=0..Sunday=6 for a JS Date */
function mondayDow(date: Date): number {
  return (date.getDay() + 6) % 7;
}

type BaselineEntry = { dow: number; slot: number }; // dow 0=Mon..6=Sun

// ---------- Page shell: pick which tournament to register for ----------
function RegisterPage() {
  const { t: requested } = Route.useSearch();
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<TournamentConfig[]>([]);
  const [direct, setDirect] = useState<TournamentConfig | null>(null);

  useEffect(() => {
    void (async () => {
      const [openList, directTournament] = await Promise.all([
        fetchOpenTournaments(),
        requested != null ? fetchTournamentByNum(requested) : Promise.resolve(null),
      ]);
      setOpen(openList);
      setDirect(directTournament);
      setLoading(false);
    })();
  }, [requested]);

  const selected = useMemo(() => {
    if (requested != null) {
      // Prefer the open match; fall back to the directly-fetched tournament
      // so direct links stay accessible even after registration would close.
      return open.find((t) => t.tournament_num === requested) ?? direct ?? null;
    }
    return open.length === 1 ? open[0] : null;
  }, [open, direct, requested]);

  if (loading) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="container mx-auto px-4 py-10 flex justify-center">
          <Loader2 className="size-6 animate-spin text-sand" />
        </div>
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="container mx-auto px-4 py-6 max-w-3xl space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-2xl sm:text-3xl">Tournament Registration</h1>
            <Button asChild variant="ghost" size="sm">
              <Link to="/tournament"><ArrowLeft className="size-4 mr-1" />Back</Link>
            </Button>
          </div>
          {open.length === 0 ? (
            <Card className="p-6 border-sand/40">
              <p className="text-sm text-muted-foreground">
                There are no tournament registrations open right now. Keep an eye on{" "}
                <Link to="/tournament" className="text-sand underline">the tournaments page</Link> for the next event.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Multiple registrations are open. Pick the tournament you want to sign up for.
              </p>
              {open.map((t) => (
                <Card key={t.tournament_num} className="p-4 border-sand/40 flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <div className="font-display text-lg text-sand">{t.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Starts {parseLocalDate(t.start_date).toLocaleDateString()} · Registration closes{" "}
                      {registrationClosesAt(t).toLocaleString()}
                    </div>
                  </div>
                  <Button asChild className="bg-sand text-background hover:bg-sand/90">
                    <Link to="/tournament-register" search={{ t: t.tournament_num }}>Register</Link>
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return <RegisterForm key={selected.tournament_num} tournament={selected} multiOpen={open.length > 1} />;
}

// ---------- The actual form ----------
function RegisterForm({ tournament, multiOpen }: { tournament: TournamentConfig; multiOpen: boolean }) {
  const navigate = useNavigate();
  const DAYS = tournamentDayCount(tournament);
  const WEEKS = tournamentWeekCount(tournament);
  const TOTAL = DAYS * SLOTS;
  const gridStart = useMemo(() => parseLocalDate(tournament.start_date), [tournament.start_date]);

  const blockToUtcIso = useCallback((day: number, slot: number): string => {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + day);
    d.setMinutes(slot * 30);
    return d.toISOString();
  }, [gridStart]);

  const dayOffsetToMonday = useMemo(() => (7 - mondayDow(gridStart)) % 7, [gridStart]);

  const selectionToBaseline = useCallback((sel: Set<number>): BaselineEntry[] => {
    const entries: BaselineEntry[] = [];
    const seen = new Set<string>();
    for (const id of sel) {
      const dIdx = dayOfBlock(id) - dayOffsetToMonday;
      if (dIdx < 0 || dIdx >= 7) continue;
      const key = `${dIdx}:${slotOfBlock(id)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({ dow: dIdx, slot: slotOfBlock(id) });
    }
    return entries;
  }, [dayOffsetToMonday]);

  const baselineToSelection = useCallback((baseline: BaselineEntry[]): Set<number> => {
    const s = new Set<number>();
    for (const b of baseline) {
      for (let w = 0; w < WEEKS + 1; w++) {
        const dIdx = dayOffsetToMonday + b.dow + w * 7;
        if (dIdx >= 0 && dIdx < DAYS) s.add(blockId(dIdx, b.slot));
      }
    }
    return s;
  }, [DAYS, WEEKS, dayOffsetToMonday]);

  const [userId, setUserId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  // Consent (dynamic per tournament)
  const [consents, setConsents] = useState<Record<string, boolean>>({});
  const consented = tournament.checkboxes.every((c) => consents[c.id]);

  // Identity
  const [direwolf, setDirewolf] = useState("");
  const [email, setEmail] = useState("");
  const [discord, setDiscord] = useState("");
  const [initialDiscord, setInitialDiscord] = useState("");

  // Availability
  const [selection, setSelection] = useState<Set<number>>(new Set());
  const [saveBaseline, setSaveBaseline] = useState(false);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [discordLinked, setDiscordLinked] = useState(false);

  // Load session + prefill
  useEffect(() => {
    void (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user.id ?? null;
      setUserId(uid);
      if (uid) {
        const { data: idData } = await supabase.auth.getUserIdentities();
        if (idData?.identities?.some((i) => i.provider === "discord")) setDiscordLinked(true);

        setEmail(sess.session?.user.email ?? "");
        const { data: prof } = await supabase
          .from("profiles")
          .select("username, discord_username, availability_baseline")
          .eq("id", uid)
          .maybeSingle();
        let resolvedName = "";
        if (prof) {
          if (prof.username) resolvedName = prof.username;
          if (prof.discord_username) {
            setDiscord(prof.discord_username);
            setInitialDiscord(prof.discord_username);
          }
          if (prof.availability_baseline && Array.isArray(prof.availability_baseline)) {
            setSelection(baselineToSelection(prof.availability_baseline as BaselineEntry[]));
          }
        }
        const { data: claimed } = await supabase
          .from("player_ratings")
          .select("display_name")
          .eq("claimed_by", uid)
          .limit(1)
          .maybeSingle();
        if (claimed?.display_name) resolvedName = claimed.display_name;
        if (resolvedName) setDirewolf(resolvedName);

        if (!prof?.discord_username) {
          const candidates = Array.from(
            new Set([resolvedName, prof?.username].filter((v): v is string => !!v && v.length > 0)),
          );
          let found: string | null = null;
          for (const name of candidates) {
            const { data: tm } = await supabase
              .from("tournament_matches")
              .select("discord_username")
              .ilike("player_name", name)
              .not("discord_username", "is", null)
              .limit(1)
              .maybeSingle();
            if (tm?.discord_username) { found = tm.discord_username; break; }
            const { data: reg2 } = await supabase
              .from("tournament_registrations")
              .select("discord_username")
              .ilike("direwolf_name", name)
              .not("discord_username", "is", null)
              .order("tournament_num", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (reg2?.discord_username) { found = reg2.discord_username; break; }
          }
          if (found) { setDiscord(found); setInitialDiscord(found); }
        }

        const { data: reg } = await supabase
          .from("tournament_registrations")
          .select("direwolf_name, email, discord_username, owns_expansions, active_on_discord, availability, consents")
          .eq("user_id", uid)
          .eq("tournament_num", tournament.tournament_num)
          .maybeSingle();
        if (reg) {
          setAlreadyRegistered(true);
          setDirewolf(reg.direwolf_name);
          if (reg.email) setEmail(reg.email);
          setDiscord(reg.discord_username);
          const stored = (reg.consents && typeof reg.consents === "object" ? reg.consents : {}) as Record<string, boolean>;
          setConsents({
            ...stored,
            ...(reg.owns_expansions ? { owns_expansions: true } : {}),
            ...(reg.active_on_discord ? { active_on_discord: true } : {}),
          });
          if (Array.isArray(reg.availability)) {
            const s = new Set<number>();
            for (const iso of reg.availability as string[]) {
              const d = new Date(iso);
              const dayIdx = Math.floor((d.getTime() - gridStart.getTime()) / 86400000);
              const slot = d.getHours() * 2 + Math.floor(d.getMinutes() / 30);
              if (dayIdx >= 0 && dayIdx < DAYS && slot >= 0 && slot < SLOTS) s.add(blockId(dayIdx, slot));
            }
            setSelection(s);
          }
        }
      }
      setChecking(false);
    })();
  }, [tournament.tournament_num, DAYS, gridStart, baselineToSelection]);

  const days = useMemo(() => {
    return Array.from({ length: DAYS }).map((_, i) => {
      const d = new Date(gridStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [DAYS, gridStart]);

  // ---------- Drag selection ----------
  const dragMode = useRef<"add" | "remove" | null>(null);
  const anchorId = useRef<number | null>(null);
  const baseSelection = useRef<Set<number>>(new Set());
  const gridRef = useRef<HTMLDivElement>(null);

  const cellIdFromEvent = (clientX: number, clientY: number): number | null => {
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    if (!el) return null;
    const cell = el.closest("[data-blockid]") as HTMLElement | null;
    if (!cell) return null;
    return Number(cell.dataset.blockid);
  };

  const applyRect = (from: number, to: number, mode: "add" | "remove") => {
    const d1 = dayOfBlock(from), s1 = slotOfBlock(from);
    const d2 = dayOfBlock(to), s2 = slotOfBlock(to);
    const dMin = Math.min(d1, d2), dMax = Math.max(d1, d2);
    const sMin = Math.min(s1, s2), sMax = Math.max(s1, s2);
    const next = new Set(baseSelection.current);
    for (let d = dMin; d <= dMax; d++) {
      for (let s = sMin; s <= sMax; s++) {
        const id = blockId(d, s);
        if (mode === "add") next.add(id);
        else next.delete(id);
      }
    }
    setSelection(next);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const id = cellIdFromEvent(e.clientX, e.clientY);
    if (id == null) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragMode.current = selection.has(id) ? "remove" : "add";
    anchorId.current = id;
    baseSelection.current = new Set(selection);
    applyRect(id, id, dragMode.current);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragMode.current || anchorId.current == null) return;
    const id = cellIdFromEvent(e.clientX, e.clientY);
    if (id == null) return;
    applyRect(anchorId.current, id, dragMode.current);
  };

  const onPointerUp = () => {
    dragMode.current = null;
    anchorId.current = null;
  };

  // ---------- Fast fill helpers ----------
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const on = () => setCompact(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const [weekIdx, setWeekIdx] = useState(0);

  const applyWeek1ToRest = () => {
    setSelection((prev) => {
      const next = new Set(prev);
      for (let d = 0; d < Math.min(7, DAYS); d++) {
        const slotsForDay: number[] = [];
        for (let s = 0; s < SLOTS; s++) if (next.has(blockId(d, s))) slotsForDay.push(s);
        for (let w = 1; w < WEEKS; w++) {
          const targetDay = d + w * 7;
          if (targetDay >= DAYS) continue;
          for (let s = 0; s < SLOTS; s++) next.delete(blockId(targetDay, s));
          for (const s of slotsForDay) next.add(blockId(targetDay, s));
        }
      }
      return next;
    });
    toast.success(`Copied Week 1 across all ${WEEKS} weeks`);
  };

  const clearAll = () => setSelection(new Set());

  // ---------- Live availability stats ----------
  const stats = useMemo(() => {
    const overall = TOTAL ? (selection.size / TOTAL) * 100 : 0;
    const weeks: { pct: number; ok: boolean }[] = [];
    for (let w = 0; w < WEEKS; w++) {
      const startDay = w * 7;
      const endDay = Math.min(startDay + 7, DAYS);
      const total = (endDay - startDay) * SLOTS;
      let filled = 0;
      for (const id of selection) {
        const d = dayOfBlock(id);
        if (d >= startDay && d < endDay) filled++;
      }
      const pct = total ? (filled / total) * 100 : 0;
      weeks.push({ pct, ok: pct >= tournament.required_weekly_pct });
    }
    return { overall, overallOk: overall >= tournament.required_availability_pct, weeks };
  }, [selection, TOTAL, WEEKS, DAYS, tournament.required_availability_pct, tournament.required_weekly_pct]);

  // ---------- Submit ----------
  const [submitting, setSubmitting] = useState(false);
  const [linkingDiscord, setLinkingDiscord] = useState(false);

  useEffect(() => {
    const name = direwolf.trim();
    if (!name) return;
    if (discord.trim()) return;
    let cancelled = false;
    void (async () => {
      const key = name.toLowerCase();
      const { data, error } = await supabase
        .from("player_discord_map")
        .select("discord_username")
        .or(`player_key.eq.${key},display_name.ilike.${name}`)
        .limit(2);
      if (cancelled || error || !data || data.length !== 1) return;
      const d = (data[0] as { discord_username?: string | null }).discord_username;
      if (d && !discord.trim()) setDiscord(d);
    })();
    return () => { cancelled = true; };
  }, [direwolf, discord]);

  const linkDiscord = async () => {
    setLinkingDiscord(true);
    const redirectTo = typeof window !== "undefined" ? window.location.href : undefined;
    const { error } = userId
      ? await supabase.auth.linkIdentity({ provider: "discord", options: { redirectTo } })
      : await supabase.auth.signInWithOAuth({ provider: "discord", options: { redirectTo } });
    setLinkingDiscord(false);
    if (error) toast.error(error.message);
  };

  const submit = async () => {
    if (!consented) return;
    if (!direwolf.trim()) { toast.error("Direwolf name required"); return; }
    if (direwolf.includes("+")) {
      toast.error("Direwolf name cannot contain a \"+\". Please enter your name without the + and anything after it.");
      return;
    }
    if (!discord.trim()) { toast.error("Discord username required"); return; }

    if (!stats.overallOk) {
      toast.error(
        `Availability too low (${stats.overall.toFixed(1)}%). At least ${tournament.required_availability_pct}% of the schedule is required.`,
      );
      return;
    }
    const badWeek = stats.weeks.findIndex((w) => !w.ok);
    if (badWeek >= 0) {
      toast.error(
        `Week ${badWeek + 1} only has ${stats.weeks[badWeek].pct.toFixed(1)}% availability. At least ${tournament.required_weekly_pct}% per week is required.`,
      );
      return;
    }

    setSubmitting(true);
    try {
      const availability = Array.from(selection)
        .sort((a, b) => a - b)
        .map((id) => blockToUtcIso(dayOfBlock(id), slotOfBlock(id)));

      const payload = {
        user_id: userId,
        tournament_num: tournament.tournament_num,
        direwolf_name: direwolf.trim(),
        email: email.trim() || null,
        discord_username: discord.trim(),
        owns_expansions: consents.owns_expansions === true,
        active_on_discord: consents.active_on_discord === true,
        consents: tournament.checkboxes.reduce<Record<string, boolean>>((acc, c) => {
          acc[c.id] = consents[c.id] === true;
          return acc;
        }, {}),
        availability,
        timezone: resolveTimezoneLabel(),
        updated_at: new Date().toISOString(),
      };
      const { error: regErr } = userId
        ? await supabase.from("tournament_registrations").upsert(payload, { onConflict: "user_id,tournament_num" })
        : await supabase.from("tournament_registrations").insert(payload);
      if (regErr) throw regErr;

      if (userId) {
        const profileUpdates: { discord_username?: string; availability_baseline?: BaselineEntry[] } = {};
        if (discord.trim() && discord.trim() !== initialDiscord) profileUpdates.discord_username = discord.trim();
        if (saveBaseline) profileUpdates.availability_baseline = selectionToBaseline(selection);
        if (Object.keys(profileUpdates).length) {
          await supabase.from("profiles").update(profileUpdates as never).eq("id", userId);
        }
      }

      toast.success(
        alreadyRegistered
          ? `Registration updated for ${tournament.name}!`
          : `You're registered for ${tournament.name}!`,
      );
      void navigate({ to: "/tournament" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to register");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto px-4 py-6 max-w-6xl space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="font-display text-2xl sm:text-3xl">Register — {tournament.name}</h1>
          <div className="flex gap-2">
            {multiOpen && (
              <Button asChild variant="outline" size="sm">
                <Link to="/tournament-register">Other tournaments</Link>
              </Button>
            )}
            <Button asChild variant="ghost" size="sm">
              <Link to="/tournament"><ArrowLeft className="size-4 mr-1" />Back</Link>
            </Button>
          </div>
        </div>

        {(tournament.info_title || tournament.info_text || tournament.prizes_summary || tournament.prizes_text) && (
          <Card className="p-6 border-sand/40 bg-card/70 space-y-3">
            {tournament.info_title && <h2 className="font-display text-lg mb-2 text-sand">{tournament.info_title}</h2>}
            {tournament.info_text && (
              <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{tournament.info_text}</p>
            )}
            <PrizesInfo summary={tournament.prizes_summary} details={tournament.prizes_text} />
          </Card>
        )}

        {!userId && !checking && (
          <Card className="p-4 border-sand/40 bg-card/70">
            <p className="text-sm text-muted-foreground">
              Registering as a guest.{" "}
              <Link to="/auth" className="text-sand underline">Sign in</Link>{" "}
              to auto-fill your Direwolf name, Discord handle, and saved availability baseline and be allowed to adjust your registration.
            </p>
          </Card>
        )}

        {/* Consent */}
        {tournament.checkboxes.length > 0 && (
          <Card className="p-6 border-sand/40">
            <h2 className="font-display text-lg mb-4">Profile & Platform Verification</h2>
            <div className="space-y-3">
              {tournament.checkboxes.map((c) => (
                <label key={c.id} className="flex items-start gap-3 cursor-pointer">
                  <Checkbox
                    checked={consents[c.id] === true}
                    onCheckedChange={(v) => setConsents((prev) => ({ ...prev, [c.id]: v === true }))}
                    className="mt-0.5"
                  />
                  <span className="text-sm leading-relaxed whitespace-pre-line">{c.label}</span>
                </label>
              ))}
            </div>
          </Card>
        )}

        <fieldset disabled={!consented} className={!consented ? "opacity-60 pointer-events-none" : ""}>
          {/* Identity */}
          <Card className="p-6 border-sand/40 space-y-4">
            <h2 className="font-display text-lg">Player Identity</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="direwolf">Direwolf Name <span className="text-destructive">*</span></Label>
                <Input
                  id="direwolf"
                  value={direwolf}
                  onChange={(e) => setDirewolf(e.target.value)}
                  placeholder="Your in-game name"
                  aria-invalid={direwolf.includes("+")}
                />
                {direwolf.includes("+") && (
                  <p className="text-[11px] text-destructive mt-1">
                    Your Direwolf name can't contain a "+". Enter the name without the + and anything after it.
                  </p>
                )}
              </div>


              <div>
                <Label htmlFor="email">Email Address (optional)</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="discord">Discord Username <span className="text-destructive">*</span></Label>
                <Input id="discord" value={discord} onChange={(e) => setDiscord(e.target.value)} placeholder="remarkable91" />
                {discordLinked ? (
                  <div className="mt-2">
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-green-500/40 bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-500">
                      <CheckCircle2 className="size-3.5" />
                      Discord linked
                    </span>
                  </div>
                ) : (
                  <div className="mt-2">
                    <Button type="button" variant="outline" size="sm" onClick={linkDiscord} disabled={linkingDiscord}>
                      {linkingDiscord ? "Linking…" : userId ? "Link Discord account" : "Sign in with Discord"}
                    </Button>
                  </div>
                )}

                <div className="flex items-start gap-3 mt-2 p-3 rounded-md border border-border bg-background/40">
                  <img src={discordHint.url} alt="Discord username example" className="h-8 rounded" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Enter your unique <b>lowercase Discord handle</b> (e.g. <code>remarkable91</code>),
                    not your display nickname. This is what shows under your name on Discord.
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {/* Availability */}
          <Card className="p-6 border-sand/40 space-y-4 mt-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="font-display text-lg">Availability</h2>
                <p className="text-xs text-muted-foreground">
                  Drag to select 30-minute blocks (works on touch). Shown in your local timezone.
                </p>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <Button size="sm" variant="outline" onClick={applyWeek1ToRest}>Apply Week 1 to all weeks</Button>
                <Button size="sm" variant="ghost" onClick={clearAll}>Clear</Button>
                <label className="flex items-center gap-2 text-xs">
                  <Switch checked={saveBaseline} onCheckedChange={setSaveBaseline} />
                  Save as my baseline template
                </label>
              </div>
            </div>


            {compact && (
              <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-background/40 px-2 py-1.5">
                <Button size="sm" variant="ghost" onClick={() => setWeekIdx((w) => Math.max(0, w - 1))} disabled={weekIdx === 0}>
                  <ChevronLeft className="size-4" /> Prev
                </Button>
                <div className="text-xs font-medium text-sand">
                  Week {weekIdx + 1} of {WEEKS} — {days[weekIdx * 7]?.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  {" – "}
                  {days[Math.min(weekIdx * 7 + 6, DAYS - 1)]?.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </div>
                <Button size="sm" variant="ghost" onClick={() => setWeekIdx((w) => Math.min(WEEKS - 1, w + 1))} disabled={weekIdx >= WEEKS - 1}>
                  Next <ChevronRight className="size-4" />
                </Button>
              </div>
            )}

            <AvailabilityGrid
              days={days}
              startDay={compact ? weekIdx * 7 : 0}
              visibleDays={compact ? 7 : DAYS}
              selection={selection}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              gridRef={gridRef}
            />
          </Card>

          <div className="mt-6 flex justify-end gap-3">
            <Button
              size="lg"
              onClick={submit}
              disabled={!consented || submitting}
              className="bg-sand text-background hover:bg-sand/90 gap-2"
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              {alreadyRegistered ? `Update Registration for ${tournament.name}` : `Register for ${tournament.name}`}
            </Button>
          </div>
        </fieldset>

        <p className="text-xs text-muted-foreground text-center pt-2">
          Check-in opens {checkinStart(tournament).toLocaleString()}. Tournament runs{" "}
          {parseLocalDate(tournament.start_date).toLocaleDateString()} –{" "}
          {parseLocalDate(tournament.end_date).toLocaleDateString()}. Registration closes{" "}
          {registrationClosesAt(tournament).toLocaleString()}.
        </p>
      </div>
    </div>
  );
}

// ---------- Grid component ----------
function AvailabilityGrid({
  days, startDay = 0, visibleDays, selection, onPointerDown, onPointerMove, onPointerUp, gridRef,
}: {
  days: Date[];
  startDay?: number;
  visibleDays: number;
  selection: Set<number>;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  gridRef: React.RefObject<HTMLDivElement | null>;
}) {
  const slotLabels = useMemo(() => {
    const out: string[] = [];
    for (let h = 0; h < 24; h++) out.push(`${h.toString().padStart(2, "0")}:00`);
    return out;
  }, []);

  const visible = days.slice(startDay, startDay + visibleDays);

  return (
    <div className="border border-border rounded-md overflow-x-auto">
      <div
        ref={gridRef}
        className="grid select-none"
        style={{
          gridTemplateColumns: `56px repeat(${visible.length}, minmax(38px, 1fr))`,
          touchAction: "none",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="sticky left-0 bg-background z-10 border-b border-r border-border" />
        {visible.map((d, vi) => {
          const i = startDay + vi;
          return (
            <div
              key={i}
              className="text-[10px] text-center border-b border-border py-1 leading-tight bg-background/70 flex flex-col items-center gap-1"
            >
              <div className="text-muted-foreground">
                {d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </div>
              <div className="text-sand font-medium">
                {d.toLocaleDateString(undefined, { weekday: "short" })}
              </div>
            </div>
          );
        })}

        {Array.from({ length: SLOTS }).map((_, slot) => {
          const isHour = slot % 2 === 0;
          return (
            <RowFragment
              key={slot}
              slot={slot}
              isHour={isHour}
              label={isHour ? slotLabels[slot / 2] : ""}
              selection={selection}
              startDay={startDay}
              visibleDays={visible.length}
            />
          );
        })}
      </div>
    </div>
  );
}

function RowFragment({ slot, isHour, label, selection, startDay, visibleDays }: {
  slot: number; isHour: boolean; label: string; selection: Set<number>; startDay: number; visibleDays: number;
}) {
  return (
    <>
      <div className={`sticky left-0 bg-background z-10 text-[10px] text-muted-foreground px-1 border-r border-border ${isHour ? "border-t" : ""} h-4 flex items-center`}>
        {isHour ? label : ""}
      </div>
      {Array.from({ length: visibleDays }).map((_, vd) => {
        const day = startDay + vd;
        const id = blockId(day, slot);
        const selected = selection.has(id);
        return (
          <div
            key={day}
            data-blockid={id}
            className={`h-4 border-r border-border ${isHour ? "border-t" : "border-t border-dashed border-border/40"} ${
              selected ? "bg-sand" : "bg-background hover:bg-sand/10"
            }`}
          />
        );
      })}
    </>
  );
}
