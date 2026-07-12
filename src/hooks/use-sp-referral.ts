import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/**
 * If the user landed via /r/:username, a referrer key is stored in
 * localStorage. Once they sign in, redeem it via sp_register_referral.
 * Idempotent server-side, so safe to call on every mount.
 */
export function useSpReferralRedeem() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const code = localStorage.getItem("sp_referrer");
    if (!code) return;

    let cancelled = false;
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        if (!sess.session?.user) return; // wait until user signs in
        const { data, error } = await supabase.rpc("sp_register_referral", {
          p_referrer_key: code,
        });
        if (cancelled || error) return;
        const res = data as { ok?: boolean; reason?: string } | null;
        // Any terminal outcome — clear the stored code so we don't retry forever.
        try {
          localStorage.removeItem("sp_referrer");
        } catch {
          // ignore
        }
        if (res?.ok) {
          toast.success("Referral applied! +50 SP unlocks when you claim your player name.", {
            duration: 5000,
          });
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
