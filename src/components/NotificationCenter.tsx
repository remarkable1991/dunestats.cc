import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, Trophy, Gift, Swords, X, Sparkles, AlarmClock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useNotifications,
  labelForAction,
  isCheckinTournament,
  type MediumMatch,
  type MediumReferral,
} from "@/lib/notifications";
import { titleName, titleColor } from "@/lib/player-title";
import { formatLongDate } from "@/lib/tournaments";
import { DISCORD_INVITE_URL } from "@/lib/tournament-config";

function fmtDelta(v: number | null | undefined) {
  const n = Number(v ?? 0);
  const s = n > 0 ? "+" : "";
  return `${s}${n.toFixed(1)}`;
}

function deltaClass(v: number | null | undefined) {
  const n = Number(v ?? 0);
  if (n > 0) return "text-emerald-400";
  if (n < 0) return "text-destructive";
  return "text-muted-foreground";
}

function MatchCard({ m, onDismiss }: { m: MediumMatch; onDismiss: () => void }) {
  return (
    <div className="relative rounded-lg border border-border/60 bg-card/60 p-3">
      <button
        aria-label="Dismiss match notification"
        onClick={onDismiss}
        className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
      >
        <X className="size-4" />
      </button>
      <div className="flex items-center gap-2 text-sm font-medium">
        <Swords className="size-4 text-primary" />
        Match result · #{m.placement ?? "–"} place
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {m.leader_name ? `${m.leader_name} · ` : ""}
        {m.points ?? 0} points · {new Date(m.created_at).toLocaleDateString()}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs">
        <span className={deltaClass(m.elo_delta)}>Elo {fmtDelta(m.elo_delta)}</span>
        <span className={deltaClass(m.elo_delta_overall)}>Lifetime {fmtDelta(m.elo_delta_overall)}</span>
      </div>
      {m.public_match_id ? (
        <Button asChild variant="link" size="sm" className="mt-1 h-auto p-0 text-xs">
          <Link to="/match/$matchId" params={{ matchId: m.public_match_id }}>
            View match
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

function ReferralCard({ r, onDismiss }: { r: MediumReferral; onDismiss: () => void }) {
  const jackpot = r.action_type === "referral_jackpot";
  return (
    <div className="relative rounded-lg border border-border/60 bg-card/60 p-3">
      <button
        aria-label="Dismiss referral notification"
        onClick={onDismiss}
        className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
      >
        <X className="size-4" />
      </button>
      <div className="flex items-center gap-2 text-sm font-medium">
        <Gift className="size-4 text-primary" />
        {jackpot ? "Referral jackpot!" : "Someone used your referral link"}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        +{r.amount} Rewards · {new Date(r.created_at).toLocaleDateString()}
      </div>
    </div>
  );
}

export function NotificationCenter() {
  const { userId, data, dismiss, clearAll, unreadCount } = useNotifications();
  const [open, setOpen] = useState(false);
  const [modalIndex, setModalIndex] = useState(0);
  const rankChecked = useRef(false);

  const checkins = data.major_tournaments.filter(isCheckinTournament);
  const major = data.major_tournaments.filter((t) => !isCheckinTournament(t));
  const current = major[modalIndex];
  const checkin = checkins[0];

  useEffect(() => {
    setModalIndex(0);
  }, [major.length]);

  // Rank promotion toast
  useEffect(() => {
    if (!userId || rankChecked.current) return;
    if (typeof window === "undefined") return;
    rankChecked.current = true;
    const key = `sa-last-title-${userId}`;
    const name = titleName(data.lifetime_sp);
    const prev = window.localStorage.getItem(key);
    if (prev && prev !== name) {
      toast.success(`Promoted to ${name}!`, { description: `You now hold the ${name} title.` });
    }
    window.localStorage.setItem(key, name);
  }, [userId, data.lifetime_sp]);

  if (!userId) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="sm" className="relative" aria-label="Notifications">
            <Bell className="size-4" />
            {unreadCount > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            ) : null}
          </Button>
        </SheetTrigger>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Activity log</SheetTitle>
            <SheetDescription>Everything new since your last visit. Notifications expire after 7 days.</SheetDescription>
          </SheetHeader>

          <ScrollArea className="mt-4 h-[calc(100vh-11rem)] pr-3">
            <div className="space-y-3">
              {data.small_events.length > 0 ? (
                <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
                  <div className="mb-1 flex items-center gap-2 font-medium text-foreground">
                    <Sparkles className="size-4 text-primary" /> Since your last login
                  </div>
                  {data.small_events.map((e) => (
                    <div key={e.action_type}>
                      {e.count}x {labelForAction(e.action_type)}
                    </div>
                  ))}
                </div>
              ) : null}

              {checkins.map((t) => (
                <div
                  key={`checkin-${t.tournament_num}`}
                  className="relative rounded-lg border-2 border-emerald-500 bg-emerald-500/10 p-3"
                >
                  <button
                    aria-label="Dismiss check-in notification"
                    onClick={() => void dismiss("tournament_checkin", t.tournament_num)}
                    className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <AlarmClock className="size-4 animate-pulse text-emerald-400" />
                    Check-in open · Tournament #{t.tournament_num}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t.info_title || t.name} · check-in closes 1 hour before the tournament starts.
                  </div>
                  <Button
                    asChild
                    size="sm"
                    className="mt-2 bg-emerald-600 text-white hover:bg-emerald-500"
                  >
                    <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer">
                      Check in on Discord
                    </a>
                  </Button>
                </div>
              ))}

              {major.map((t) => (
                <div key={t.tournament_num} className="relative rounded-lg border border-primary/40 bg-primary/5 p-3">
                  <button
                    aria-label="Dismiss tournament notification"
                    onClick={() => void dismiss("tournament_modal", t.tournament_num)}
                    className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Trophy className="size-4 text-primary" />
                    {t.name}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Registration open · starts {formatLongDate(t.start_date)}
                  </div>
                  <Button asChild size="sm" className="mt-2">
                    <Link to="/tournament-register" search={{ t: t.tournament_num }} onClick={() => setOpen(false)}>
                      Register now
                    </Link>
                  </Button>
                </div>
              ))}

              {data.medium_matches.map((m) => (
                <MatchCard key={m.game_id} m={m} onDismiss={() => void dismiss("match_result", m.game_id)} />
              ))}

              {data.medium_referrals.map((r) => (
                <ReferralCard key={r.event_id} r={r} onDismiss={() => void dismiss("referral", r.event_id)} />
              ))}

              {unreadCount === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">You're all caught up.</p>
              ) : null}
            </div>
          </ScrollArea>

          {unreadCount > 0 ? (
            <Button variant="outline" size="sm" className="mt-4 w-full" onClick={() => void clearAll()}>
              Clear all
            </Button>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={!!current} onOpenChange={(o) => !o && current && void dismiss("tournament_modal", current.tournament_num)}>
        <DialogContent>
          {current ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Trophy className="size-5 text-primary" />
                  {current.name}
                </DialogTitle>
                <DialogDescription>
                  Registration is open · starts {formatLongDate(current.start_date)}
                </DialogDescription>
              </DialogHeader>
              {current.info_title ? <p className="font-medium">{current.info_title}</p> : null}
              {current.info_text ? (
                <p className="whitespace-pre-line text-sm text-muted-foreground">{current.info_text}</p>
              ) : null}
              <Badge variant="outline" style={{ color: titleColor(data.lifetime_sp) }} className="w-fit">
                {titleName(data.lifetime_sp)}
              </Badge>
              <DialogFooter className="gap-2 sm:justify-between">
                <Button variant="ghost" onClick={() => void dismiss("tournament_modal", current.tournament_num)}>
                  Got it
                </Button>
                <Button asChild onClick={() => void dismiss("tournament_modal", current.tournament_num)}>
                  <Link to="/tournament-register" search={{ t: current.tournament_num }}>
                    Register now
                  </Link>
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
