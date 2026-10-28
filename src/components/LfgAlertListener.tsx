import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { lfgBrowserDelivery } from "@/lib/lfg-alerts.functions";
import type { LfgAlert } from "@/lib/lfg-alerts";

export const LFG_PREFS_EVENT = "lfg-alert-prefs-changed";

export function playChime() {
  const audio = new AudioContext();
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.connect(gain); gain.connect(audio.destination);
  oscillator.frequency.setValueAtTime(660, audio.currentTime);
  oscillator.frequency.setValueAtTime(880, audio.currentTime + .12);
  gain.gain.setValueAtTime(.1, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .4);
  oscillator.start(); oscillator.stop(audio.currentTime + .4);
  oscillator.onended = () => { void audio.close(); };
}

/** Site-wide browser notification delivery; mounted once in the root layout so alerts fire on every page. */
export function LfgAlertListener() {
  const [userId, setUserId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<{ browser_enabled: boolean; sound_enabled: boolean } | null>(null);
  const [alerts, setAlerts] = useState<LfgAlert[]>([]);
  const pending = useRef(new Set<string>());
  const delivery = useServerFn(lfgBrowserDelivery);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setUserId(session?.user.id ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadPrefs = useCallback(async () => {
    if (!userId) { setPrefs(null); return; }
    const { data } = await supabase.from("lfg_alert_preferences").select("browser_enabled,sound_enabled").eq("user_id", userId).maybeSingle();
    setPrefs(data ?? null);
  }, [userId]);

  useEffect(() => {
    pending.current.clear(); setAlerts([]);
    void loadPrefs();
    const onChange = () => { void loadPrefs(); };
    window.addEventListener(LFG_PREFS_EVENT, onChange);
    window.addEventListener("focus", onChange);
    return () => { window.removeEventListener(LFG_PREFS_EVENT, onChange); window.removeEventListener("focus", onChange); };
  }, [loadPrefs]);

  const enabled = !!userId && !!prefs?.browser_enabled;
  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase.from("lfg_alert_deliveries")
      .select("id,lobby_id,title,body,kind,state,browser_received_at,email_due_at,expires_at")
      .eq("user_id", userId).eq("state", "pending").gt("expires_at", new Date().toISOString()).limit(20);
    if (!error) setAlerts((data ?? []) as LfgAlert[]);
  }, [userId]);

  useEffect(() => {
    if (!enabled || !userId) return;
    void refresh();
    const channel = supabase.channel(`lfg-alert-listener-${userId}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "lfg_alert_deliveries", filter: `user_id=eq.${userId}` }, () => void refresh())
      .subscribe((status) => { if (status === "SUBSCRIBED") void refresh(); });
    const timer = setInterval(refresh, 30000);
    return () => { clearInterval(timer); void supabase.removeChannel(channel); };
  }, [enabled, userId, refresh]);

  useEffect(() => {
    if (!enabled || !prefs || !("Notification" in window) || Notification.permission !== "granted") return;
    const sound = prefs.sound_enabled;
    for (const alert of alerts) {
      if (alert.state !== "pending" || pending.current.has(alert.id) || Date.parse(alert.expires_at) <= Date.now()) continue;
      pending.current.add(alert.id);
      void (async () => {
        let claimed = false;
        try {
          claimed = await delivery({ data: { id: alert.id, action: "claim" } });
          if (!claimed) return;
          const notification = new Notification(alert.title, { body: alert.body, tag: alert.id, silent: !sound });
          let shown = false;
          notification.onshow = () => {
            shown = true;
            // Retry acknowledgement; browser_pending already blocks email meanwhile.
            const acknowledge = () => delivery({ data: { id: alert.id, action: "received" } }).catch(() => {
              window.setTimeout(() => { void acknowledge(); }, 5000);
              return false;
            });
            void acknowledge();
            if (sound) { try { playChime(); } catch { /* Audio may be blocked without a gesture. */ } }
          };
          notification.onclick = () => { window.focus(); window.location.assign(`/lfg/${alert.lobby_id}`); notification.close(); };
          notification.onerror = () => { if (!shown) void delivery({ data: { id: alert.id, action: "failed" } }); };
          // No timeout fallback: uncertain OS delivery must never cause a duplicate email.
        } catch {
          if (claimed) await delivery({ data: { id: alert.id, action: "failed" } }).catch(() => false);
        }
      })();
    }
  }, [alerts, enabled, prefs, delivery]);

  return null;
}
