import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error || !data) throw new Error("Main admins only");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

const clean = (s: string) => s.replace(/[%_,()]/g, "").trim();

/** Everything known about a name: ratings record, registrations, tournament seats and aliases. */
export const lookupPlayerName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ name: z.string().trim().min(2).max(64) }))
  .handler(async ({ data, context }) => {
    const db = await assertAdmin(context as any);
    const term = clean(data.name);
    const [ratings, regs, seats, aliases] = await Promise.all([
      db.from("player_ratings").select("player_key,display_name,claimed_by,game_version").ilike("display_name", `%${term}%`).eq("game_version", "overall").limit(20),
      db.from("tournament_registrations").select("id,tournament_num,direwolf_name,discord_username,user_id,updated_at").ilike("direwolf_name", `%${term}%`).order("tournament_num", { ascending: false }).limit(50),
      db.from("tournament_matches").select("tournament_num,player_name").ilike("player_name", `%${term}%`).limit(500),
      db.from("player_name_aliases").select("id,old_name,canonical_name,tournament_num,created_at").or(`old_name.ilike.%${term}%,canonical_name.ilike.%${term}%`).limit(50),
    ]);
    const seatMap = new Map<string, { name: string; tournaments: number[] }>();
    for (const s of (seats.data ?? []) as { tournament_num: number; player_name: string }[]) {
      const k = s.player_name.trim().toLowerCase();
      const e = seatMap.get(k) ?? { name: s.player_name.trim(), tournaments: [] };
      if (!e.tournaments.includes(s.tournament_num)) e.tournaments.push(s.tournament_num);
      seatMap.set(k, e);
    }
    return {
      ratings: ratings.data ?? [],
      registrations: regs.data ?? [],
      seats: [...seatMap.values()].map((s) => ({ ...s, tournaments: s.tournaments.sort((a, b) => b - a) })),
      aliases: aliases.data ?? [],
    };
  });

/**
 * Corrects a wrong IGN everywhere: tournament seats, registrations, account claim
 * and a remembered alias so a future registration with the old name is redirected.
 */
export const renamePlayerEverywhere = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      oldName: z.string().trim().min(1).max(64),
      newName: z.string().trim().min(1).max(64),
      updateSeats: z.boolean(),
      updateRegistrations: z.boolean(),
      updateAccount: z.boolean(),
    }),
  )
  .handler(async ({ data, context }) => {
    const db = await assertAdmin(context as any);
    const oldL = data.oldName.toLowerCase();
    const newL = data.newName.toLowerCase();
    if (oldL === newL) throw new Error("Names are the same");
    const result = { seats: 0, registrations: 0, claimed: 0, profile: 0, alias: false };

    const { data: regs } = await db.from("tournament_registrations").select("id,user_id,direwolf_name").ilike("direwolf_name", data.oldName);
    const oldRegs = ((regs ?? []) as { id: string; user_id: string | null; direwolf_name: string }[]).filter(
      (r) => r.direwolf_name.trim().toLowerCase() === oldL,
    );

    if (data.updateSeats) {
      const { data: rows } = await db.from("tournament_matches").select("id,player_name").ilike("player_name", data.oldName);
      const ids = ((rows ?? []) as { id: string; player_name: string }[]).filter((r) => r.player_name.trim().toLowerCase() === oldL).map((r) => r.id);
      if (ids.length) {
        const { error } = await db.from("tournament_matches").update({ player_name: data.newName, updated_at: new Date().toISOString() }).in("id", ids);
        if (error) throw new Error(error.message);
        result.seats = ids.length;
      }
    }
    if (data.updateRegistrations && oldRegs.length) {
      const { error } = await db.from("tournament_registrations").update({ direwolf_name: data.newName, updated_at: new Date().toISOString() }).in("id", oldRegs.map((r) => r.id));
      if (error) throw new Error(error.message);
      result.registrations = oldRegs.length;
    }
    if (data.updateAccount) {
      const owners = new Set(oldRegs.map((r) => r.user_id).filter(Boolean) as string[]);
      const { data: oldClaim } = await db.from("player_ratings").select("claimed_by").eq("player_key", oldL).not("claimed_by", "is", null).limit(1);
      if (oldClaim?.[0]?.claimed_by) owners.add(oldClaim[0].claimed_by);
      if (owners.size > 1) throw new Error("The old name belongs to more than one account — review manually");
      const owner = [...owners][0];
      if (owner) {
        const { data: claimed, error } = await db.from("player_ratings").update({ claimed_by: owner }).eq("player_key", newL).is("claimed_by", null).select("id");
        if (error) throw new Error(error.message);
        result.claimed = claimed?.length ?? 0;
        const { error: pErr } = await db.from("profiles").update({ username: data.newName, updated_at: new Date().toISOString() }).eq("id", owner);
        if (!pErr) result.profile = 1;
      }
    }
    const { error: aErr } = await db.from("player_name_aliases").insert({ old_name: data.oldName, canonical_name: data.newName, created_by: (context as any).userId });
    result.alias = !aErr;
    return result;
  });

export const deleteNameAlias = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data, context }) => {
    const db = await assertAdmin(context as any);
    const { error } = await db.from("player_name_aliases").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
