import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, Rocket, ShieldAlert, Trophy } from "lucide-react";
import {
  CHECKIN_START_TIME_UTC,
  DISCORD_INVITE_URL,
  TOURNAMENT_NUMBER,
  TOURNAMENT_START_DATE,
  checkinEndUtc,
  tournamentStartUtc,
} from "@/lib/tournament-config";

type Phase = "pre" | "live" | "active";

function diffParts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  };
}

export function TournamentAnnouncement() {
  return (
    <Card className="p-6 sm:p-8 border-sand/40 bg-gradient-to-br from-card via-card to-card/40">
      <div className="flex items-center gap-3 mb-3">
        <Trophy className="size-6 text-sand" />
        <h2 className="font-display text-2xl">
          Tournament {TOURNAMENT_NUMBER} — Uprising + CHOAM + Immortality (11 VP)
        </h2>
      </div>
      <div className="text-muted-foreground space-y-3 text-sm sm:text-[0.95rem] leading-relaxed">
        <p>
          Strategy Arena is happy to host our 14th Dune Imperium ASync tournament! We had a poll
          on our Discord and the game mode will be <b className="text-sand">Uprising + CHOAM + Immortality to 11 VP</b>.
        </p>
        <p>
          The games will be organized through this Discord server. We hope to find players who can
          regularly act on a notification so each game takes only a few days up to 2–3 weeks to
          complete. With all the group stages and Semi Final / Final it usually takes 2 months for
          it all to finish.
        </p>
      </div>
    </Card>
  );
}

export function TournamentCountdown({ showRegisterCta = true }: { showRegisterCta?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const checkinStart = new Date(CHECKIN_START_TIME_UTC).getTime();
  const checkinEnd = checkinEndUtc().getTime();
  const phase: Phase = now < checkinStart ? "pre" : now < checkinEnd ? "live" : "active";

  const checkinLocal = new Date(CHECKIN_START_TIME_UTC).toLocaleString(undefined, {
    weekday: "short", year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  });
  const tournamentStartLocal = tournamentStartUtc().toLocaleString(undefined, {
    weekday: "short", year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  });

  return (
    <Card className="p-6 sm:p-8 border-sand/40 bg-card/60">
      {phase === "pre" && (
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Check-in opens <span className="text-sand font-medium">{checkinLocal}</span>
          </div>
          <CountdownDisplay ms={checkinStart - now} label="Countdown to Check-In Open" />
          <div className="text-sm text-muted-foreground pt-1">
            Tournament starts 24 hours later at&nbsp;<span className="text-sand font-medium">{tournamentStartLocal}</span>
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button asChild size="lg" className="bg-sand text-background hover:bg-sand/90 gap-2">
              <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer">
                Join our Tournament Discord Server <ExternalLink className="size-4" />
              </a>
            </Button>
            {showRegisterCta && (
              <Button asChild size="lg" variant="outline" className="border-sand/60 text-sand hover:bg-sand/10 gap-2">
                <Link to="/tournament-register">
                  Go to Tournament Registration Page <Rocket className="size-4" />
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}

      {phase === "live" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-lg sm:text-xl font-display animate-pulse text-sand">
            <ShieldAlert className="size-5" />
            🚨 CHECK-IN IS NOW LIVE ON OUR DISCORD!
          </div>
          <CountdownDisplay
            ms={checkinEnd - now}
            label="Tournament Matches Begin In"
            compact
          />
          <div className="flex flex-wrap gap-3 pt-2">
            <Button asChild size="lg" className="bg-sand text-background hover:bg-sand/90 gap-2">
              <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer">
                Check In on Discord Now <ExternalLink className="size-4" />
              </a>
            </Button>
            {showRegisterCta && (
              <Button asChild size="lg" variant="outline" className="border-sand/60 text-sand hover:bg-sand/10 gap-2">
                <Link to="/tournament-register">
                  Registration Page <Rocket className="size-4" />
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}

      {phase === "active" && (
        <div className="space-y-2">
          <div className="font-display text-xl text-sand">
            Tournament {TOURNAMENT_NUMBER} Is Now In Progress!
          </div>
          <div className="text-muted-foreground text-sm">
            Check match layouts below. Matches began on {TOURNAMENT_START_DATE}.
          </div>
        </div>
      )}
    </Card>
  );
}

function CountdownDisplay({ ms, label, compact }: { ms: number; label: string; compact?: boolean }) {
  const p = diffParts(ms);
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{label}</div>
      <div className="flex flex-wrap gap-2 sm:gap-3">
        {!compact && <TimeCell value={p.d} unit="Days" />}
        <TimeCell value={p.h} unit="Hours" />
        <TimeCell value={p.m} unit="Minutes" />
        {!compact && <TimeCell value={p.s} unit="Seconds" />}
      </div>
    </div>
  );
}

function TimeCell({ value, unit }: { value: number; unit: string }) {
  return (
    <div className="min-w-[64px] sm:min-w-[80px] rounded-lg border border-sand/30 bg-background/60 px-3 py-2 text-center">
      <div className="font-display text-2xl sm:text-3xl text-sand tabular-nums">
        {value.toString().padStart(2, "0")}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{unit}</div>
    </div>
  );
}