import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DONATION_CURRENCIES, DONATION_PAYMENT_METHODS } from "@/lib/donations";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Main admins only");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export const listDonationsForAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await assertAdmin(context as any);
    const [donations, seasons] = await Promise.all([
      db.from("donations").select("*").order("created_at", { ascending: false }).limit(200),
      db.from("sp_seasons").select("id,name,starts_at,ends_at").order("id", { ascending: false }),
    ]);
    if (donations.error) throw new Error("Could not load donation submissions");
    return { donations: donations.data ?? [], seasons: seasons.data ?? [] };
  });

export const verifyDonation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data, context }) => {
    const db = await assertAdmin(context as any);
    const { data: updated, error } = await db
      .from("donations")
      .update({ status: "verified", verified_by: (context as any).userId, verified_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("status", "pending")
      .select("id");
    if (error) throw new Error("Could not verify this donation");
    if (!updated?.length) throw new Error("This submission was already reviewed");
    return { ok: true };
  });

export const rejectDonation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data, context }) => {
    const db = await assertAdmin(context as any);
    const { data: updated, error } = await db
      .from("donations")
      .update({ status: "rejected", verified_by: (context as any).userId, verified_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("status", "pending")
      .select("id");
    if (error) throw new Error("Could not reject this donation");
    if (!updated?.length) throw new Error("This submission was already reviewed");
    return { ok: true };
  });

const manualInput = z.object({
  donorName: z.string().trim().min(2).max(80),
  playerKey: z.string().trim().max(100).nullable(),
  amount: z.number().positive().max(1_000_000),
  currency: z.enum(DONATION_CURRENCIES),
  allocation: z.object({
    tournament: z.number().int().min(0).max(100),
    maintenance: z.number().int().min(0).max(100),
    developer: z.number().int().min(0).max(100),
  }).refine((value) => value.tournament + value.maintenance + value.developer === 100, {
    message: "Allocation percentages must add up to 100",
  }),
  hideName: z.boolean(),
  hideAmount: z.boolean(),
  paymentMethod: z.enum(DONATION_PAYMENT_METHODS),
  donorNote: z.string().trim().max(500).nullable(),
  seasonId: z.number().int().positive().nullable(),
  donatedAt: z.string().min(1),
});

export const createHistoricalDonation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(manualInput)
  .handler(async ({ data, context }) => {
    const db = await assertAdmin(context as any);
    const donatedAt = new Date(data.donatedAt);
    if (Number.isNaN(donatedAt.getTime())) throw new Error("Enter a valid donation date");
    const { data: inserted, error } = await db.from("donations").insert({
      donor_name: data.donorName,
      player_key: data.playerKey ? data.playerKey.toLowerCase() : null,
      amount: Math.round(data.amount * 100) / 100,
      currency: data.currency,
      tournament_pct: data.allocation.tournament,
      maintenance_pct: data.allocation.maintenance,
      developer_pct: data.allocation.developer,
      hide_name: data.hideName,
      hide_amount: data.hideAmount,
      payment_method: data.paymentMethod,
      donor_note: data.donorNote || null,
      season_id: data.seasonId,
      donated_at: donatedAt.toISOString(),
      status: "verified",
      verified_by: (context as any).userId,
      verified_at: new Date().toISOString(),
    }).select("id").single();
    if (error) throw new Error(error.message || "Could not save this historical donation");
    return { id: inserted.id as string };
  });
