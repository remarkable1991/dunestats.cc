import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AlarmClock, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";

type Registration = {
  has_checked_in: boolean | null;
  check_in_method: string | null;
  checked_in_at: string | null;
};

type Status = "loading" | "not-registered" | "not-checked-in" | "discord-only" | "checked-in";

/** True when the check_in_method indicates a website check-in (website or discord/website). */
function isWebsiteCheckedIn(method: string | null): boolean {
  return !!method && method.includes("website");
}

export function TournamentCheckin({ tournamentNum }: { tournamentNum: number }) {
  const [status, setStatus] = useState<Status>("loading");
  const [method, setMethod] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) {
        if (!cancelled) setStatus("not-registered");
        return;
      }
      const { data, error } = await supabase
        .from("tournament_registrations")
        .select("has_checked_in, check_in_method, checked_in_at")
        .eq("tournament_num", tournamentNum)
        .eq("user_id", uid)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setStatus("not-registered");
        return;
      }
      const reg = data as Registration;
      setMethod(reg.check_in_method ?? null);
      if (isWebsiteCheckedIn(reg.check_in_method)) {
        setStatus("checked-in");
      } else if (reg.has_checked_in && reg.check_in_method === "discord") {
        setStatus("discord-only");
      } else {
        setStatus("not-checked-in");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tournamentNum]);

  // Not logged in or not registered → hide entirely.
  if (status === "loading" || status === "not-registered") return null;

  async function update(patch: Partial<Registration>) {
    setSubmitting(true);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) {
      setSubmitting(false);
      toast.error("You must be signed in to check in.");
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
    if (patch.check_in_method) setMethod(patch.check_in_method);
    if (isWebsiteCheckedIn(patch.check_in_method ?? method)) {
      setStatus("checked-in");
      toast.success("✅ You are checked in!");
    } else {
      setStatus("checked-in");
      toast.success("Check-in confirmed on the website.");
    }
  }

  // STATE C — fully checked in (website or discord/website)
  if (status === "checked-in") {
    return (
      <Card className="p-4 border-2 border-emerald-500/60 bg-emerald-500/5 flex items-center gap-3">
        <CheckCircle2 className="size-5 text-emerald-400 shrink-0" />
        <div>
          <p className="font-display text-sm text-emerald-300">
            ✅ You are successfully checked in!
          </p>
          <p className="text-xs text-muted-foreground">
            Method: {method || "website"} · No further action needed.
          </p>
        </div>
      </Card>
    );
  }

  // STATE B — checked in via Discord only
  if (status === "discord-only") {
    return (
      <Card className="p-4 border-2 border-amber-500/50 bg-amber-500/5 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck className="size-5 text-amber-400 shrink-0" />
          <div>
            <p className="font-display text-sm text-amber-300">
              Checked in on Discord — confirm on the website too
            </p>
            <p className="text-xs text-muted-foreground">
              Confirming on the website helps us verify your identity.
            </p>
          </div>
        </div>
        <Button
          disabled={submitting}
          onClick={() => update({ check_in_method: "discord/website" })}
          className="bg-amber-600 text-white hover:bg-amber-600/90"
        >
          {submitting ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
          Confirm Check-In on Website
        </Button>
      </Card>
    );
  }

  // STATE A — not checked in
  return (
    <Card className="p-4 border-2 border-emerald-500/60 bg-gradient-to-br from-emerald-500/10 via-card to-card flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
      <div className="flex items-center gap-3">
        <AlarmClock className="size-5 text-emerald-400 shrink-0 animate-pulse" />
        <div>
          <p className="font-display text-sm">Check in for this tournament</p>
          <p className="text-xs text-muted-foreground">
            Confirm your attendance to be seated at a table.
          </p>
        </div>
      </div>
      <Button
        disabled={submitting}
        onClick={() =>
          update({
            has_checked_in: true,
            check_in_method: "website",
            checked_in_at: new Date().toISOString(),
          })
        }
        className="bg-emerald-600 text-white hover:bg-emerald-600/90"
      >
        {submitting ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
        Check In Now
      </Button>
    </Card>
  );
}
