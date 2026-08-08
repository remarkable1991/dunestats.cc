import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SmallEvent = { action_type: string; count: number };

export type MediumMatch = {
  game_id: string;
  public_match_id: string | null;
  placement: number | null;
  points: number | null;
  leader_name: string | null;
  elo_delta: number | null;
  elo_delta_overall: number | null;
  created_at: string;
};

export type MediumReferral = {
  event_id: string;
  action_type: string;
  amount: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type MajorTournament = {
  tournament_num: number;
  name: string;
  info_title: string | null;
  info_text: string | null;
  start_date: string;
  end_date: string | null;
  updated_at: string;
  is_checkin?: boolean | null;
  notification_type?: string | null;
};

/** True when the tournament notification is a check-in phase alert. */
export function isCheckinTournament(t: MajorTournament): boolean {
  return t.is_checkin === true || t.notification_type === "tournament_checkin";
}

export type NotificationsPayload = {
  last_sign_in_at: string;
  player_key: string | null;
  lifetime_sp: number;
  small_events: SmallEvent[];
  medium_matches: MediumMatch[];
  medium_referrals: MediumReferral[];
  major_tournaments: MajorTournament[];
};

export type NotificationType = "tournament_modal" | "tournament_checkin" | "match_result" | "referral";

const EMPTY: NotificationsPayload = {
  last_sign_in_at: new Date().toISOString(),
  player_key: null,
  lifetime_sp: 0,
  small_events: [],
  medium_matches: [],
  medium_referrals: [],
  major_tournaments: [],
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Notifications older than 7 days expire client-side too. */
function fresh<T extends { created_at: string }>(rows: T[]): T[] {
  const cutoff = Date.now() - WEEK_MS;
  return (rows ?? []).filter((r) => new Date(r.created_at).getTime() >= cutoff);
}

export function labelForAction(action: string): string {
  return action.replace(/_/g, " ");
}

export function useNotifications() {
  const [userId, setUserId] = useState<string | null>(null);
  const [data, setData] = useState<NotificationsPayload>(EMPTY);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: s }) => setUserId(s.session?.user.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUserId(s?.user?.id ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const load = useCallback(
    async (uid: string, touch: boolean) => {
      setLoading(true);
      try {
        const { data: raw, error } = await supabase.rpc("get_user_notifications", { p_user_id: uid });
        if (error) throw error;
        const payload = (raw ?? {}) as Partial<NotificationsPayload>;
        setData({
          ...EMPTY,
          ...payload,
          small_events: payload.small_events ?? [],
          medium_matches: fresh(payload.medium_matches ?? []),
          medium_referrals: fresh(payload.medium_referrals ?? []),
          major_tournaments: payload.major_tournaments ?? [],
        });
        // Record the login trace so future logins only surface new events.
        if (touch) await supabase.rpc("touch_last_sign_in");
      } catch {
        setData(EMPTY);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!userId) {
      setData(EMPTY);
      return;
    }
    void load(userId, true);
  }, [userId, load]);

  const dismiss = useCallback(
    async (type: NotificationType, referenceId?: string | number | null) => {
      const ref = referenceId == null ? null : String(referenceId);
      setData((prev) => ({
        ...prev,
        major_tournaments:
          type === "tournament_modal" || type === "tournament_checkin"
            ? prev.major_tournaments.filter((t) => String(t.tournament_num) !== ref)
            : prev.major_tournaments,
        medium_matches:
          type === "match_result" ? prev.medium_matches.filter((m) => m.game_id !== ref) : prev.medium_matches,
        medium_referrals:
          type === "referral" ? prev.medium_referrals.filter((r) => r.event_id !== ref) : prev.medium_referrals,
      }));
      await supabase.rpc("dismiss_user_notification", {
        p_notification_type: type,
        p_reference_id: ref ?? undefined,
      });
    },
    [],
  );

  const clearAll = useCallback(async () => {
    const items: [NotificationType, string][] = [
      ...data.major_tournaments.map(
        (t) =>
          [isCheckinTournament(t) ? "tournament_checkin" : "tournament_modal", String(t.tournament_num)] as [
            NotificationType,
            string,
          ],
      ),
      ...data.medium_matches.map((m) => ["match_result", m.game_id] as [NotificationType, string]),
      ...data.medium_referrals.map((r) => ["referral", r.event_id] as [NotificationType, string]),
    ];
    setData((prev) => ({ ...prev, major_tournaments: [], medium_matches: [], medium_referrals: [], small_events: [] }));
    await Promise.all(
      items.map(([type, ref]) =>
        supabase.rpc("dismiss_user_notification", { p_notification_type: type, p_reference_id: ref }),
      ),
    );
  }, [data]);

  const unreadCount =
    data.major_tournaments.length +
    data.medium_matches.length +
    data.medium_referrals.length +
    (data.small_events.length > 0 ? 1 : 0);

  return { userId, data, loading, dismiss, clearAll, unreadCount, refresh: () => userId && load(userId, false) };
}
