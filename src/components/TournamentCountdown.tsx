import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trophy, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  type TournamentConfig,
  checkinStart,
  fetchOpenTournaments,
  formatLongDate,
  tournamentDayCount,
} from "@/lib/tournaments";

export function TournamentCountdown() {
  const [open, setOpen] = useState<TournamentConfig[] | null>(null);
  const [registered, setRegistered] = useState<Set<number>>(new Set());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    void (async () => setOpen(await fetchOpenTournaments()))();
  }, []);

  useEffect(() => {
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;
      const { data } = await supabase
        .from("tournament_registrations")
        .select("tournament_num")
        .eq("user_id", uid);
      setRegistered(new Set((data ?? []).map((r) => r.tournament_num)));
    })();
  }, []);

  if (open === null) {
    return (
      <Card className="p-6 sm:p-8 border-sand/40 bg-card/60">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading tournaments…
        </div>
      </Card>
    );
  }

  if (open.length === 0) {
    return (
      <Card className="p-6 sm:p-8 border-sand/40 bg-card/60">
        <div className="flex items-center gap-3 mb-3">
          <Trophy className="size-6 text-sand" />
          <h2 className="font-display text-2xl">No open registrations</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          There are no tournaments open for registration right now. Check the tournament page or come back soon.
        </p>
      </Card>
    );
  }

  const dateFmt: Intl.DateTimeFormatOptions = {
    weekday: "short", year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Trophy className="size-6 text-sand" />
        <h2 className="font-display text-2xl">
          {open.length === 1 ? "Open for registration" : `${open.length} Tournaments open for registration`}
        </h2>
      </div>

      {open.map((t) => {
        const checkinAt = checkinStart(t);
        const checkinLocal = mounted
          ? checkinAt.toLocaleString(undefined, dateFmt)
          : checkinAt.toLocaleString("en-US", { ...dateFmt, timeZone: "UTC" });
        const isRegistered = registered.has(t.tournament_num);

        return (
          <Card
            key={t.tournament_num}
            className="p-6 sm:p-8 border-sand/40 bg-gradient-to-br from-card via-card to-card/40 space-y-4"
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h3 className="font-display text-xl sm:text-2xl">
                  {t.info_title?.trim() || t.name}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Tournament #{t.tournament_num} · {formatLongDate(t.start_date)} → {formatLongDate(t.end_date)} ({tournamentDayCount(t)} days)
                </p>
              </div>
              <Button
                asChild
                className={
                  isRegistered
                    ? "bg-emerald-600 text-white hover:bg-emerald-600/90"
                    : "bg-sand text-background hover:bg-sand/90"
                }
              >
                <Link to="/tournament-register" search={{ t: t.tournament_num }}>
                  {isRegistered ? "Registered! Adjust your registration" : "Register now"}
                </Link>
              </Button>
            </div>

            {t.info_text?.trim() && (
              <p className="text-muted-foreground text-sm sm:text-[0.95rem] leading-relaxed whitespace-pre-line">
                {t.info_text}
              </p>
            )}

            <div className="text-xs text-muted-foreground">
              Check-in opens {checkinLocal} · Tournament starts 24 hours later · Minimum availability{" "}
              {t.required_availability_pct}% overall and {t.required_weekly_pct}% per week
            </div>
          </Card>
        );
      })}
    </div>
  );
}
