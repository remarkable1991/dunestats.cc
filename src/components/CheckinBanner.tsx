import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlarmClock, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DISCORD_INVITE_URL } from "@/lib/tournament-config";
import {
  type TournamentConfig,
  checkinEnd,
  checkinStart,
  fetchCheckinTournaments,
  formatLongDate,
} from "@/lib/tournaments";

const dateFmt: Intl.DateTimeFormatOptions = {
  weekday: "short",
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZoneName: "short",
};

/** Website check-in action for the banner — only rendered for registered users. */
function WebsiteCheckinAction({ tournamentNum }: { tournamentNum: number }) {
  const [status, setStatus] = useState<"loading" | "hidden" | "not-checked-in" | "discord-only" | "checked-in">(
    "loading",
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) {
        if (!cancelled) setStatus("hidden");
        return;
      }
      const { data, error } = await supabase
        .from("tournament_registrations")
        .select("has_checked_in, check_in_method")
        .eq("tournament_num", tournamentNum)
        .eq("user_id", uid)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setStatus("hidden");
        return;
      }
      const method = (data.check_in_method as string | null) ?? null;
      if (method?.includes("website")) {
        setStatus("checked-in");
      } else if (data.has_checked_in && method === "discord") {
        setStatus("discord-only");
      } else {
        setStatus("not-checked-in");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tournamentNum]);

  if (status === "loading" || status === "hidden") return null;

  async function checkIn(patch: Record<string, unknown>) {
    setSubmitting(true);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) {
      setSubmitting(false);
      return;
    }
    const { error } = await supabase
      .from("tournament_registrations")
      .update(patch)
      .eq("tournament_num", tournamentNum)
      .eq("user_id", uid);
    setSubmitting(false);
    if (error) {
      toast.error("Check-in failed", { description: error.message });
      return;
    }
    setStatus("checked-in");
    toast.success("✅ You are checked in!");
  }

  if (status === "checked-in") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-400">
        <CheckCircle2 className="size-4" /> Checked in
      </span>
    );
  }

  if (status === "discord-only") {
    return (
      <Button
        variant="outline"
        disabled={submitting}
        onClick={() => checkIn({ check_in_method: "discord/website" })}
        className="border-amber-500/60 text-amber-300 hover:bg-amber-500/10"
      >
        {submitting ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
        Confirm on website
      </Button>
    );
  }

  return (
    <Button
      disabled={submitting}
      onClick={() =>
        checkIn({
          has_checked_in: true,
          check_in_method: "website",
          checked_in_at: new Date().toISOString(),
        })
      }
      className="bg-emerald-600 text-white hover:bg-emerald-600/90"
    >
      {submitting ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
      Check in on website
    </Button>
  );
}

function remaining(end: Date, now: number): string {
  const ms = Math.max(0, end.getTime() - now);
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

export function CheckinBanner() {
  const [list, setList] = useState<TournamentConfig[]>([]);
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setMounted(true);
    void (async () => setList(await fetchCheckinTournaments()))();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!mounted || list.length === 0) return null;

  return (
    <div className="space-y-4">
      {list.map((t) => {
        const end = checkinEnd(t);
        if (now >= end.getTime()) return null;
        const opened = checkinStart(t).toLocaleString(undefined, dateFmt);

        return (
          <Card
            key={t.tournament_num}
            className="p-6 sm:p-8 border-2 border-emerald-500/60 bg-gradient-to-br from-emerald-500/10 via-card to-card space-y-4"
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <AlarmClock className="size-6 text-emerald-400 animate-pulse" />
                <div>
                  <h3 className="font-display text-xl sm:text-2xl">
                    Check-in is open — {t.info_title?.trim() || t.name}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Tournament #{t.tournament_num} · starts {formatLongDate(t.start_date)}
                  </p>
                </div>
              </div>
              <Button asChild className="bg-emerald-600 text-white hover:bg-emerald-600/90">
                <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer">
                  Check in on Discord
                </a>
              </Button>
            </div>

            <p className="text-sm text-muted-foreground">
              Check-in opened {opened} and closes in{" "}
              <span className="font-semibold text-emerald-400 tabular-nums">{remaining(end, now)}</span>. You must
              check in on Discord within this 24 hour window to be seated at a table.
            </p>
          </Card>
        );
      })}
    </div>
  );
}
