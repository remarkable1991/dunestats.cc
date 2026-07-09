import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Navbar } from "@/components/Navbar";
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
  TOURNAMENT_NUMBER,
  TOURNAMENT_START_DATE,
  DISCORD_INVITE_URL,
  firstMondayOfTournament,
  tournamentGridStart,
} from "@/lib/tournament-config";
import discordHint from "@/assets/discord-hint.png.asset.json";


export const Route = createFileRoute("/tournament-register")({
  head: () => ({
    meta: [
      { title: `Register — Tournament ${TOURNAMENT_NUMBER} · Strategy Arena` },
      { name: "description", content: "Sign up for the next Strategy Arena Dune Imperium tournament." },
    ],
  }),
  component: RegisterPage,
});

// ---------- Grid math ----------
const DAYS = 28;
const SLOTS = 48; // 30-min blocks in 24h
const TOTAL = DAYS * SLOTS;

function blockId(day: number, slot: number) { return day * SLOTS + slot; }
function dayOfBlock(id: number) { return Math.floor(id / SLOTS); }
function slotOfBlock(id: number) { return id % SLOTS; }

/** Convert a local (day-index, slot) to UTC ISO string using tournament start date. */
function blockToUtcIso(day: number, slot: number): string {
  const base = tournamentGridStart();
  const d = new Date(base);
  d.setDate(d.getDate() + day);
  d.setMinutes(slot * 30);
  return d.toISOString();
}

/** dayOfWeek where Monday=0..Sunday=6 for a JS Date */
function mondayDow(date: Date): number {
  return (date.getDay() + 6) % 7;
}

// ---------- Baseline template (relative to Monday) ----------
type BaselineEntry = { dow: number; slot: number }; // dow 0=Mon..6=Sun

function selectionToBaseline(sel: Set<number>): BaselineEntry[] {
  // Keep only entries in the first 7 days from the first Monday within the grid.
  const gridStart = tournamentGridStart();
  const monday = firstMondayOfTournament();
  const dayOffsetToMonday = Math.round((monday.getTime() - gridStart.getTime()) / 86400000);
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
}

function baselineToSelection(baseline: BaselineEntry[]): Set<number> {
  const gridStart = tournamentGridStart();
  const monday = firstMondayOfTournament();
  const dayOffsetToMonday = Math.round((monday.getTime() - gridStart.getTime()) / 86400000);
  const s = new Set<number>();
  for (const b of baseline) {
    for (let w = 0; w < 4; w++) {
      const dIdx = dayOffsetToMonday + b.dow + w * 7;
      if (dIdx >= 0 && dIdx < DAYS) s.add(blockId(dIdx, b.slot));
    }
  }
  return s;
}

// ---------- Page ----------
function RegisterPage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  // Consent
  const [ownsExpansions, setOwnsExpansions] = useState(false);
  const [activeOnDiscord, setActiveOnDiscord] = useState(false);
  const consented = ownsExpansions && activeOnDiscord;

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
        if (idData?.identities?.some((i) => i.provider === "discord")) {
          setDiscordLinked(true);
        }

        const emailVal = sess.session?.user.email ?? "";
        setEmail(emailVal);
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
        // Prefer the player_name they've claimed on the leaderboard
        const { data: claimed } = await supabase
          .from("player_ratings")
          .select("display_name")
          .eq("claimed_by", uid)
          .limit(1)
          .maybeSingle();
        if (claimed?.display_name) resolvedName = claimed.display_name;
        if (resolvedName) setDirewolf(resolvedName);

        // If no discord on profile, try to find one from previous tournaments
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
          if (found) {
            setDiscord(found);
            setInitialDiscord(found);
          }
        }

        // If they already have a registration for this tournament, hydrate it too
        const { data: reg } = await supabase
          .from("tournament_registrations")
          .select("direwolf_name, email, discord_username, owns_expansions, active_on_discord, availability")
          .eq("user_id", uid)
          .eq("tournament_num", TOURNAMENT_NUMBER)
          .maybeSingle();
        if (reg) {
          setAlreadyRegistered(true);
          setDirewolf(reg.direwolf_name);
          if (reg.email) setEmail(reg.email);
          setDiscord(reg.discord_username);
          setOwnsExpansions(reg.owns_expansions);
          setActiveOnDiscord(reg.active_on_discord);
          if (Array.isArray(reg.availability)) {
            const s = new Set<number>();
            const base = tournamentGridStart();
            for (const iso of reg.availability as string[]) {
              const d = new Date(iso);
              const dayIdx = Math.floor((d.getTime() - base.getTime()) / 86400000);
              const slot = d.getHours() * 2 + Math.floor(d.getMinutes() / 30);
              if (dayIdx >= 0 && dayIdx < DAYS && slot >= 0 && slot < SLOTS) {
                s.add(blockId(dayIdx, slot));
              }
            }
            setSelection(s);
          }
        }
      }
      setChecking(false);
    })();
  }, []);

  const days = useMemo(() => {
    const base = tournamentGridStart();
    return Array.from({ length: DAYS }).map((_, i) => {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, []);

  // ---------- Drag selection ----------
  // Rectangle-drag: from anchor cell to current cell, all cells in-between get set.
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
      for (let d = 0; d < 7; d++) {
        const slotsForDay: number[] = [];
        for (let s = 0; s < SLOTS; s++) if (next.has(blockId(d, s))) slotsForDay.push(s);
        for (let w = 1; w < 4; w++) {
          const targetDay = d + w * 7;
          if (targetDay >= DAYS) continue;
          for (let s = 0; s < SLOTS; s++) next.delete(blockId(targetDay, s));
          for (const s of slotsForDay) next.add(blockId(targetDay, s));
        }
      }
      return next;
    });
    toast.success("Copied Week 1 across all 4 weeks");
  };

  const clearAll = () => setSelection(new Set());

  // ---------- Submit ----------
  const [submitting, setSubmitting] = useState(false);
  const [linkingDiscord, setLinkingDiscord] = useState(false);

  // Auto-fill Discord from player_discord_map when Direwolf is set and Discord is empty
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
    const { error } = await supabase.auth.linkIdentity({
      provider: "discord",
      options: {
        redirectTo: typeof window !== "undefined" ? window.location.href : undefined,
      },
    });
    setLinkingDiscord(false);
    if (error) toast.error(error.message);
  };

  const submit = async () => {
    if (!consented) return;
    if (!direwolf.trim()) { toast.error("Direwolf name required"); return; }
    if (!discord.trim()) { toast.error("Discord username required"); return; }


    // Availability sanity checks
    const filled = selection.size;
    const pct = (filled / TOTAL) * 100;

    // Detect first-week-only selection (nothing selected past day 7)
    let onlyWeek1 = filled > 0;
    for (const id of selection) {
      if (dayOfBlock(id) >= 7) { onlyWeek1 = false; break; }
    }
    if (onlyWeek1) {
      const ok = window.confirm(
        "You only filled availability for Week 1. Copy Week 1 to all 4 weeks? You'll need to click Register again after.",
      );
      if (ok) applyWeek1ToRest();
      else toast.error("Please fill availability for the remaining weeks before registering.");
      return;
    }

    if (pct < 5) {
      toast.error(
        `Availability too low (${pct.toFixed(1)}%). At least 5% of the schedule is required to register.`,
      );
      return;
    }
    if (pct < 10) {
      const ok = window.confirm(
        `Warning: only ${pct.toFixed(1)}% availability filled. With this little overlap you may not be matched into games. Register anyway?`,
      );
      if (!ok) return;
    }

    setSubmitting(true);
    try {
      const availability = Array.from(selection)
        .sort((a, b) => a - b)
        .map((id) => blockToUtcIso(dayOfBlock(id), slotOfBlock(id)));

      const payload = {
        user_id: userId,
        tournament_num: TOURNAMENT_NUMBER,
        direwolf_name: direwolf.trim(),
        email: email.trim() || null,
        discord_username: discord.trim(),
        owns_expansions: ownsExpansions,
        active_on_discord: activeOnDiscord,
        availability,
        updated_at: new Date().toISOString(),
      };
      const { error: regErr } = userId
        ? await supabase
            .from("tournament_registrations")
            .upsert(payload, { onConflict: "user_id,tournament_num" })
        : await supabase.from("tournament_registrations").insert(payload);
      if (regErr) throw regErr;

      // Persist discord + baseline to profile if signed in
      if (userId) {
        const profileUpdates: {
          discord_username?: string;
          availability_baseline?: BaselineEntry[];
        } = {};
        if (discord.trim() && discord.trim() !== initialDiscord) {
          profileUpdates.discord_username = discord.trim();
        }
        if (saveBaseline) {
          profileUpdates.availability_baseline = selectionToBaseline(selection);
        }
        if (Object.keys(profileUpdates).length) {
          await supabase.from("profiles").update(profileUpdates as never).eq("id", userId);
        }
      }

      toast.success(
        alreadyRegistered
          ? `Registration updated for Tournament ${TOURNAMENT_NUMBER}!`
          : `You're registered for Tournament ${TOURNAMENT_NUMBER}!`,
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
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl sm:text-3xl">
            Register — Tournament {TOURNAMENT_NUMBER}
          </h1>
          <Button asChild variant="ghost" size="sm">
            <Link to="/tournament"><ArrowLeft className="size-4 mr-1" />Back</Link>
          </Button>
        </div>

        {!userId && !checking && (
          <Card className="p-4 border-sand/40 bg-card/70">
            <p className="text-sm text-muted-foreground">
              Registering as a guest.{" "}
              <Link to="/auth" className="text-sand underline">Sign in</Link>{" "}
              to auto-fill your Direwolf name, Discord handle, and saved availability baseline.
            </p>
          </Card>
        )}

        {/* Consent */}
        <Card className="p-6 border-sand/40">
          <h2 className="font-display text-lg mb-4">Profile & Platform Verification</h2>
          <div className="space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                checked={ownsExpansions}
                onCheckedChange={(v) => setOwnsExpansions(v === true)}
                className="mt-0.5"
              />
              <span className="text-sm leading-relaxed">
                I confirm that I own <b>Dune Imperium Digital</b> and the required expansions
                (<b>Uprising</b> and <b>Immortality</b>).
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                checked={activeOnDiscord}
                onCheckedChange={(v) => setActiveOnDiscord(v === true)}
                className="mt-0.5"
              />
              <span className="text-sm leading-relaxed">
                I confirm that I am active on our{" "}
                <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer" className="text-sand underline">
                  Strategy Arena Discord Server
                </a>
                , have played or am currently playing at least one game to demonstrate ASync
                progress, and will check in during the July 13 – July 14 window.
              </span>
            </label>
          </div>
        </Card>

        <fieldset disabled={!consented} className={!consented ? "opacity-60 pointer-events-none" : ""}>
          {/* Identity */}
          <Card className="p-6 border-sand/40 space-y-4">
            <h2 className="font-display text-lg">Player Identity</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="direwolf">Direwolf Name <span className="text-destructive">*</span></Label>
                <Input id="direwolf" value={direwolf} onChange={(e) => setDirewolf(e.target.value)} placeholder="Your in-game name" />
              </div>

              <div>
                <Label htmlFor="email">Email Address (optional)</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="discord">Discord Username <span className="text-destructive">*</span></Label>
                <Input
                  id="discord"
                  value={discord}
                  onChange={(e) => setDiscord(e.target.value)}
                  placeholder="remarkable91"
                />
                {userId && (
                  <div className="mt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={linkDiscord}
                      disabled={linkingDiscord}
                    >
                      {linkingDiscord ? "Linking…" : "Link Discord account"}
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
                <Button size="sm" variant="outline" onClick={applyWeek1ToRest}>Apply Week 1 to Weeks 2-4</Button>
                <Button size="sm" variant="ghost" onClick={clearAll}>Clear</Button>
                <label className="flex items-center gap-2 text-xs">
                  <Switch checked={saveBaseline} onCheckedChange={setSaveBaseline} />
                  Save as my baseline template
                </label>
              </div>
            </div>

            {compact && (
              <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-background/40 px-2 py-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setWeekIdx((w) => Math.max(0, w - 1))}
                  disabled={weekIdx === 0}
                >
                  <ChevronLeft className="size-4" /> Prev
                </Button>
                <div className="text-xs font-medium text-sand">
                  Week {weekIdx + 1} of 4 — {days[weekIdx * 7]?.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  {" – "}
                  {days[Math.min(weekIdx * 7 + 6, DAYS - 1)]?.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setWeekIdx((w) => Math.min(3, w + 1))}
                  disabled={weekIdx === 3}
                >
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
              {alreadyRegistered
                ? `Update Registration for Tournament ${TOURNAMENT_NUMBER}`
                : `Register for Tournament ${TOURNAMENT_NUMBER}`}
            </Button>
          </div>
        </fieldset>

        <p className="text-xs text-muted-foreground text-center pt-2">
          Tournament begins {TOURNAMENT_START_DATE}. You can update your registration any time before check-in closes.
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
    for (let h = 0; h < 24; h++) {
      out.push(`${h.toString().padStart(2, "0")}:00`);
    }
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
        {/* Header row */}
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

        {/* Slot rows */}
        {Array.from({ length: SLOTS }).map((_, slot) => {
          const isHour = slot % 2 === 0;
          return (
            <RowFragment key={slot} slot={slot} isHour={isHour} label={isHour ? slotLabels[slot / 2] : ""} selection={selection} startDay={startDay} visibleDays={visible.length} />
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