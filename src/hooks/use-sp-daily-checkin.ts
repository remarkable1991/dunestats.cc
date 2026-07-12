import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/**
 * Fires the SP daily check-in once per browser tab for the signed-in user.
 * The 24h cooldown is enforced server-side; we just avoid re-calling within
 * the same session using sessionStorage. Shows a toast when SP is awarded.
 */
export function useSpDailyCheckin() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    (async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        if (!session.session?.user) return;

        const key = `sp_checkin_tried_${session.session.user.id}`;
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, "1");

        const { data, error } = await supabase.rpc("sp_daily_checkin");
        if (cancelled || error) return;
        const res = data as { awarded?: boolean; amount?: number; reason?: string } | null;
        if (res?.awarded) {
          toast.success(`Daily Check-In Active! +${res.amount ?? 5} SP added.`, {
            duration: 4000,
          });
        } else if (res?.reason === "no_claimed_player") {
          // Silent — user hasn't claimed a player yet; no toast noise.
        }
      } catch {
        // silent
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);
}
