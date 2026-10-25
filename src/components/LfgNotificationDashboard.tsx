import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Mail, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { lfgBrowserDelivery } from "@/lib/lfg-alerts.functions";
import { DEFAULT_LFG_ALERTS, LFG_ALERT_EVENTS, emailWindow, type LfgAlert, type LfgAlertPreferences } from "@/lib/lfg-alerts";

function playChime() {
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

export function LfgNotificationDashboard({ userId }: { userId: string | null }) {
  const [prefs, setPrefs] = useState<LfgAlertPreferences>(DEFAULT_LFG_ALERTS);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [permission, setPermission] = useState<string>("unavailable");
  const [alerts, setAlerts] = useState<LfgAlert[]>([]);
  const [hours, setHours] = useState("2");
  const [now, setNow] = useState(0);
  const pending = useRef(new Set<string>());
  const delivery = useServerFn(lfgBrowserDelivery);
  useEffect(() => {
    setPermission("Notification" in window ? Notification.permission : "unavailable");
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setLoaded(false); setPrefs(DEFAULT_LFG_ALERTS); setAlerts([]); pending.current.clear();
    if (!userId) return;
    let active = true;
    void supabase.from("lfg_alert_preferences").select("browser_enabled,sound_enabled,discord_openings,event_kinds,lobby_scope,email_until")
      .eq("user_id", userId).maybeSingle().then(({ data, error }) => {
        if (!active) return;
        if (error) { toast.error("Could not load LFG alert preferences"); return; }
        setPrefs(data ?? DEFAULT_LFG_ALERTS); setLoaded(true);
      });
    return () => { active = false; };
  }, [userId]);
  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase.from("lfg_alert_deliveries")
      .select("id,lobby_id,title,body,kind,state,browser_received_at,email_due_at,expires_at")
      .eq("user_id", userId).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(40);
    if (!error) setAlerts((data ?? []) as LfgAlert[]);
  }, [userId]);
  useEffect(() => {
    if (!userId) return;
    void refresh();
    const channel = supabase.channel(`lfg-alerts-${userId}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "lfg_alert_deliveries", filter: `user_id=eq.${userId}` }, () => void refresh())
      .subscribe((status) => { if (status === "SUBSCRIBED") void refresh(); });
    const timer = setInterval(refresh, 30000);
    const focus = () => { void refresh(); };
    window.addEventListener("focus", focus);
    return () => { clearInterval(timer); window.removeEventListener("focus", focus); void supabase.removeChannel(channel); };
  }, [userId, refresh]);
  useEffect(() => {
    if (!loaded || !prefs.browser_enabled || permission !== "granted") return;
    for (const alert of alerts) {
      if (alert.state !== "pending" || pending.current.has(alert.id) || Date.parse(alert.expires_at) <= Date.now()) continue;
      pending.current.add(alert.id);
      void (async () => {
        let claimed = false;
        try {
          claimed = await delivery({ data: { id: alert.id, action: "claim" } });
          if (!claimed) return;
          const notification = new Notification(alert.title, { body: alert.body, tag: alert.id, silent: !prefs.sound_enabled });
          let shown = false;
          notification.onshow = () => {
            shown = true;
            // Keep retrying the acknowledgement on this origin; browser_pending itself blocks email in the meantime.
            const acknowledge = () => delivery({ data: { id: alert.id, action: "received" } }).catch(() => {
              window.setTimeout(() => { void acknowledge(); }, 5000);
              return false;
            });
            void acknowledge();
            if (prefs.sound_enabled) { try { playChime(); } catch { /* Audio may be blocked without a gesture. */ } }
            void refresh();
          };
          notification.onclick = () => { window.focus(); window.location.assign(`/lfg/${alert.lobby_id}`); notification.close(); };
          notification.onerror = () => { if (!shown) void delivery({ data: { id: alert.id, action: "failed" } }); };
          // No timeout fallback: an uncertain OS delivery must never result in a duplicate email.
        } catch {
          if (claimed) await delivery({ data: { id: alert.id, action: "failed" } }).catch(() => false);
        }
      })();
    }
  }, [alerts, loaded, prefs.browser_enabled, prefs.sound_enabled, permission, delivery, refresh]);
  const save = async (next: LfgAlertPreferences) => {
    if (!userId || !loaded) return;
    setBusy(true);
    const { error } = await supabase.from("lfg_alert_preferences").upsert({ user_id: userId, ...next });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setPrefs(next);
  };
  const browserToggle = async (enabled: boolean) => {
    if (enabled) {
      if (!("Notification" in window)) { toast.error("Browser notifications are unavailable here"); return; }
      try {
        const result = await Notification.requestPermission(); setPermission(result);
        if (result !== "granted") { toast.error("Allow notifications in your browser's site settings"); return; }
      } catch { toast.error("Open the website in its own tab to enable browser notifications"); return; }
    }
    await save({ ...prefs, browser_enabled: enabled });
  };
  const remaining = prefs.email_until ? Math.max(0, Date.parse(prefs.email_until) - now) : 0;
  return <section className="border-y border-border py-5 space-y-4" aria-labelledby="lfg-alert-heading">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="lfg-alert-heading" className="font-display text-xl flex items-center gap-2"><Bell className="size-5 text-primary" /> LFG notifications</h2>
      {!userId && <Button variant="outline" asChild><a href="/auth">Sign in</a></Button>}
    </div>
    <div className="grid gap-6 lg:grid-cols-2">
      <fieldset disabled={!loaded || busy} className="space-y-3 min-w-0">
        <legend className="font-medium text-sm mb-3">Notify me about</legend>
        {LFG_ALERT_EVENTS.map((event) => <Label key={event.key} className="flex items-center gap-3 text-sm font-normal">
          <Checkbox checked={prefs.event_kinds.includes(event.key)} onCheckedChange={(checked) => void save({ ...prefs, event_kinds: checked ? [...prefs.event_kinds, event.key] : prefs.event_kinds.filter((key) => key !== event.key) })} />{event.label}
        </Label>)}
        <div className="flex flex-wrap items-center gap-3 pt-1"><Label htmlFor="lfg-alert-scope">New lobby type</Label>
          <Select value={prefs.lobby_scope} onValueChange={(lobby_scope) => void save({ ...prefs, lobby_scope })}>
            <SelectTrigger id="lfg-alert-scope" className="w-40"><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="league">League</SelectItem><SelectItem value="live">Live</SelectItem><SelectItem value="async">ASync</SelectItem><SelectItem value="all">All lobbies</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </fieldset>
      <fieldset disabled={!loaded || busy} className="space-y-4 min-w-0">
        <legend className="font-medium text-sm mb-3">How to notify me</legend>
        <Label className="flex items-center justify-between gap-3"><span className="flex items-center gap-2"><Bell className="size-4" /> Browser notifications</span><Switch checked={prefs.browser_enabled} onCheckedChange={(value) => void browserToggle(value)} aria-label="Browser notifications" /></Label>
        <p className="text-xs text-muted-foreground">{permission === "denied" ? "Blocked in browser site settings" : permission === "unavailable" ? "Desktop notifications unavailable in this browser" : permission === "granted" ? "Browser permission granted" : "Browser permission not granted"}</p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label className="flex items-center gap-3"><Volume2 className="size-4" /> Sound<Switch checked={prefs.sound_enabled} onCheckedChange={(sound_enabled) => void save({ ...prefs, sound_enabled })} aria-label="Notification sound" /></Label>
          <Button size="sm" variant="ghost" onClick={() => { try { playChime(); } catch { toast.error("Sound unavailable"); } }}>Test sound</Button>
        </div>
        <Label className="flex items-center justify-between gap-3"><span>Discord · lobby openings only</span><Switch checked={prefs.discord_openings} onCheckedChange={(discord_openings) => void save({ ...prefs, discord_openings })} aria-label="Discord lobby openings" /></Label>
        <p className="text-xs text-muted-foreground">Discord preference saved for bot integration; delivery not connected yet.</p>
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <Mail className="size-4" /><Label htmlFor="lfg-email-hours">Email backup</Label>
          <Select value={hours} onValueChange={setHours}><SelectTrigger id="lfg-email-hours" className="w-28"><SelectValue /></SelectTrigger><SelectContent>{[1, 2, 4].map((h) => <SelectItem key={h} value={String(h)}>{h} hour{h > 1 ? "s" : ""}</SelectItem>)}</SelectContent></Select>
          <Button size="sm" variant="outline" onClick={() => void save({ ...prefs, email_until: emailWindow(Number(hours), Date.now()) })}>{remaining ? "Extend" : "Enable"}</Button>
          {remaining > 0 && <Button size="sm" variant="ghost" onClick={() => void save({ ...prefs, email_until: null })}>Stop emails</Button>}
        </div>
        <p className="text-xs text-muted-foreground">{remaining > 0 ? `Email window: ${Math.ceil(remaining / 60000)} minutes remaining` : "Email alerts off"}</p>
      </fieldset>
    </div>
    {alerts.length > 0 && <div className="border-t border-border pt-3 space-y-2">
      {alerts.slice(0, 5).map((alert) => <a key={alert.id} href={`/lfg/${alert.lobby_id}`} className="flex flex-wrap items-center justify-between gap-2 text-sm text-primary hover:underline"><span>{alert.title} · #{alert.lobby_id}</span><span className="text-xs text-muted-foreground">{alert.state === "browser_received" ? "Browser delivered · no email" : alert.state === "email_sent" ? "Email sent" : alert.state === "browser_pending" ? "Browser delivery reserved · email blocked" : "New"}</span></a>)}
    </div>}
  </section>;
}