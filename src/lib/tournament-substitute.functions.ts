import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { applyReplacement, candidateFit, remainingSlotTallies, type Fit } from "@/lib/tournament-substitute";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error || !data) throw new Error("Admins only");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

const norm = (s: string | null | undefined) => String(s ?? "").trim().toLowerCase();
const avOf = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export type SubCandidate = { name: string; discordId: string | null; discordUsername: string | null; fit: Fit; slots: string[]; hasAvailability: boolean };

/** Registered players not seated in this round, ranked by fit against the table's slots. */
export const listSubstituteCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ scheduleId: z.string().uuid(), oldIndex: z.number().int().min(0).max(7) }))
  .handler(async ({ data, context }) => {
    const db = await assertAdmin(context as any);
    const { data: s, error } = await db.from("tournament_match_schedules").select("*").eq("id", data.scheduleId).single();
    if (error || !s) throw new Error("Schedule not found");
    const [{ data: seats }, { data: regs }] = await Promise.all([
      db.from("tournament_matches").select("player_name").eq("tournament_num", s.tournament_num).eq("round_type", s.round_type),
      db.from("tournament_registrations").select("direwolf_name,discord_username,availability,updated_at").eq("tournament_num", s.tournament_num).order("updated_at", { ascending: false }),
    ]);
    const seated = new Set(((seats ?? []) as { player_name: string }[]).map((r) => norm(r.player_name)));
    const latest = new Map<string, { direwolf_name: string; discord_username: string | null; availability: unknown }>();
    for (const r of (regs ?? []) as any[]) if (!latest.has(norm(r.direwolf_name))) latest.set(norm(r.direwolf_name), r);

    const names: string[] = s.player_names ?? [];
    const remaining = names.filter((_, i) => i !== data.oldIndex).map((n) => avOf(latest.get(norm(n))?.availability));
    const tallies = remainingSlotTallies(s, data.oldIndex);
    const pool = [...latest.values()].filter((r) => !seated.has(norm(r.direwolf_name)) && !names.some((n) => norm(n) === norm(r.direwolf_name)));

    const keys = pool.map((r) => norm(r.direwolf_name));
    const handles = pool.map((r) => norm(r.discord_username)).filter(Boolean);
    const [{ data: maps }, { data: guild }] = await Promise.all([
      keys.length ? db.from("player_discord_map").select("player_key,display_name,discord_user_id,discord_username").in("player_key", keys) : { data: [] },
      handles.length ? db.from("discord_guild_members").select("discord_user_id,discord_username").in("discord_username", handles) : { data: [] },
    ]);
    const mapBy = new Map<string, any>();
    for (const m of (maps ?? []) as any[]) if (m.discord_user_id) mapBy.set(norm(m.player_key), m);
    const guildBy = new Map<string, string>();
    for (const g of (guild ?? []) as any[]) guildBy.set(norm(g.discord_username), g.discord_user_id);

    const rank: Record<Fit, number> = { perfect: 0, partial: 1, none: 2 };
    const candidates: SubCandidate[] = pool
      .map((r) => {
        const av = avOf(r.availability);
        const m = mapBy.get(norm(r.direwolf_name));
        const { fit, slots } = candidateFit(av, remaining, tallies);
        return {
          name: r.direwolf_name.trim(),
          discordId: m?.discord_user_id ?? guildBy.get(norm(r.discord_username)) ?? null,
          discordUsername: m?.discord_username ?? r.discord_username ?? null,
          fit,
          slots,
          hasAvailability: av.length > 0,
        };
      })
      .sort((a, b) => rank[a.fit] - rank[b.fit] || b.slots.length - a.slots.length || a.name.localeCompare(b.name));
    return { candidates };
  });

/** Search verified mappings and the Discord guild directory for manual entry. */
export const searchSubstituteDiscord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ term: z.string().trim().min(2).max(40) }))
  .handler(async ({ data, context }) => {
    const db = await assertAdmin(context as any);
    const t = data.term.replace(/[%_,()]/g, "");
    const [{ data: maps }, { data: guild }] = await Promise.all([
      db.from("player_discord_map").select("display_name,player_key,discord_user_id,discord_username").not("discord_user_id", "is", null).or(`display_name.ilike.%${t}%,discord_username.ilike.%${t}%`).limit(10),
      db.from("discord_guild_members").select("discord_user_id,discord_username,display_name,suggested_player_key").or(`display_name.ilike.%${t}%,discord_username.ilike.%${t}%`).limit(10),
    ]);
    const out = new Map<string, { ign: string; discordId: string; discordUsername: string | null; verified: boolean }>();
    for (const m of (maps ?? []) as any[]) out.set(m.discord_user_id, { ign: m.display_name ?? m.player_key ?? "", discordId: m.discord_user_id, discordUsername: m.discord_username, verified: true });
    for (const g of (guild ?? []) as any[])
      if (!out.has(g.discord_user_id)) out.set(g.discord_user_id, { ign: g.suggested_player_key ?? g.display_name, discordId: g.discord_user_id, discordUsername: g.discord_username, verified: false });
    return { results: [...out.values()] };
  });

export const replaceTournamentPlayer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      scheduleId: z.string().uuid(),
      oldIndex: z.number().int().min(0).max(7),
      newName: z.string().trim().min(1).max(64),
      newDiscordId: z.string().regex(/^\d{17,20}$/, "Discord ID must be 17-20 digits"),
      newDiscordUsername: z.string().trim().max(64).nullable(),
      linkMapping: z.boolean(),
    }),
  )
  .handler(async ({ data, context }) => {
    const db = await assertAdmin(context as any);
    const { data: s, error } = await db.from("tournament_match_schedules").select("*").eq("id", data.scheduleId).single();
    if (error || !s) throw new Error("Schedule not found");
    const oldName: string | undefined = (s.player_names ?? [])[data.oldIndex];
    if (!oldName) throw new Error("Player not found at this table");
    if ((s.player_discord_ids ?? []).map(String).includes(data.newDiscordId)) throw new Error("That Discord user is already at this table");

    const next = applyReplacement(s, data.oldIndex, data.newDiscordId, data.newName);
    const { error: e1 } = await db
      .from("tournament_match_schedules")
      .update({ ...next, updated_at: new Date().toISOString() })
      .eq("id", s.id)
      .eq("updated_at", s.updated_at);
    if (e1) throw new Error(e1.message);

    const { data: rows } = await db.from("tournament_matches").select("id,player_name").eq("tournament_num", s.tournament_num).eq("round_type", s.round_type).eq("table_identifier", s.table_identifier);
    const seat = ((rows ?? []) as { id: string; player_name: string }[]).find((r) => norm(r.player_name) === norm(oldName));
    if (seat) {
      const { error: e2 } = await db
        .from("tournament_matches")
        .update({ player_name: data.newName, discord_username: data.newDiscordUsername, updated_at: new Date().toISOString() })
        .eq("id", seat.id);
      if (e2) {
        await db.from("tournament_match_schedules").update({ player_discord_ids: s.player_discord_ids, player_names: s.player_names, votes: s.votes, votes_count: s.votes_count, status: s.status }).eq("id", s.id);
        throw new Error(e2.message);
      }
    }

    let linked = false;
    if (data.linkMapping) {
      // Only add a missing link; never overwrite an existing verified mapping.
      const { data: existing } = await db.from("player_discord_map").select("id").eq("discord_user_id", data.newDiscordId).limit(1);
      if (!existing?.length) {
        const { error: e3 } = await db.from("player_discord_map").insert({
          discord_user_id: data.newDiscordId,
          discord_username: data.newDiscordUsername,
          display_name: data.newName,
          player_key: norm(data.newName),
          source: "admin_substitute",
        });
        linked = !e3;
      }
    }
    return { oldName, newName: data.newName, seatUpdated: !!seat, linked };
  });
