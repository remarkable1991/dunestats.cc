import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SurveyParticipantSubmission = {
  category_id: string;
  submitted_at: string;
};

export type SurveyParticipant = {
  /** user_id for signed-in players, "anon:<session token>" otherwise. */
  key: string;
  signedIn: boolean;
  /** In-game name from claimed ratings, falling back to the profile username. */
  playerName: string | null;
  username: string | null;
  discordUsername: string | null;
  email: string | null;
  playerKey: string | null;
  submissions: SurveyParticipantSubmission[];
  lastSubmittedAt: string;
};

/**
 * Lists everyone who answered the survey, grouped per person.
 * Signed-in players are matched to their in-game name, profile and email;
 * anonymous visitors are grouped per browser session token.
 * Main admin only — emails come from the admin user list.
 */
export const getSurveyParticipants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as { userId: string; supabase: any };
    const { data: isAdmin, error: roleError } = await ctx.supabase.rpc("has_role", {
      _user_id: ctx.userId,
      _role: "admin",
    });
    if (roleError || !isAdmin) throw new Error("Forbidden: main admin only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [responses, ratings, profiles] = await Promise.all([
      supabaseAdmin
        .from("survey_responses")
        .select("id, category_id, user_id, session_token, created_at")
        .order("created_at", { ascending: false })
        .limit(5000),
      supabaseAdmin.from("player_ratings").select("player_key, display_name, claimed_by").not("claimed_by", "is", null),
      supabaseAdmin.from("profiles").select("id, username, discord_username"),
    ]);
    if (responses.error) throw new Error(responses.error.message);
    if (ratings.error) throw new Error(ratings.error.message);
    if (profiles.error) throw new Error(profiles.error.message);

    // Emails require the admin auth API; paginate through all users.
    const emailByUser = new Map<string, string>();
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error || !data?.users?.length) break;
      for (const u of data.users) {
        if (u.email) emailByUser.set(u.id, u.email);
      }
      if (data.users.length < 1000) break;
    }

    const ratingByUser = new Map<string, { name: string; playerKey: string }>();
    for (const r of (ratings.data ?? []) as { claimed_by: string | null; display_name: string; player_key: string }[]) {
      if (r.claimed_by && !ratingByUser.has(r.claimed_by)) {
        ratingByUser.set(r.claimed_by, { name: r.display_name, playerKey: r.player_key });
      }
    }
    const profileByUser = new Map<string, { username: string | null; discord_username: string | null }>();
    for (const p of (profiles.data ?? []) as { id: string; username: string | null; discord_username: string | null }[]) {
      profileByUser.set(p.id, { username: p.username, discord_username: p.discord_username });
    }

    const byKey = new Map<string, SurveyParticipant>();
    for (const row of (responses.data ?? []) as {
      category_id: string;
      user_id: string | null;
      session_token: string | null;
      created_at: string;
    }[]) {
      const key = row.user_id ?? `anon:${row.session_token ?? "unknown"}`;
      let participant = byKey.get(key);
      if (!participant) {
        if (row.user_id) {
          const rating = ratingByUser.get(row.user_id);
          const profile = profileByUser.get(row.user_id);
          const email = emailByUser.get(row.user_id) ?? null;
          participant = {
            key,
            signedIn: true,
            playerName: rating?.name ?? profile?.username ?? null,
            username: profile?.username ?? null,
            discordUsername: profile?.discord_username ?? null,
            email,
            playerKey: rating?.playerKey ?? null,
            submissions: [],
            lastSubmittedAt: row.created_at,
          };
        } else {
          participant = {
            key,
            signedIn: false,
            playerName: null,
            username: null,
            discordUsername: null,
            email: null,
            playerKey: null,
            submissions: [],
            lastSubmittedAt: row.created_at,
          };
        }
        byKey.set(key, participant);
      }
      participant.submissions.push({ category_id: row.category_id, submitted_at: row.created_at });
      if (row.created_at > participant.lastSubmittedAt) participant.lastSubmittedAt = row.created_at;
    }

    const participants = [...byKey.values()].sort((a, b) => (a.lastSubmittedAt < b.lastSubmittedAt ? 1 : -1));
    return { participants, total: participants.length };
  });
