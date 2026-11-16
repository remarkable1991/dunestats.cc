import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { DONATION_CURRENCIES, DONATION_PAYMENT_METHODS } from "@/lib/donations";

function donationClient(url: string, key: string, authorization?: string) {
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      headers: authorization ? { Authorization: authorization } : undefined,
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

const boardInput = z.object({
  seasonId: z.number().int().positive().nullable(),
  currency: z.enum(DONATION_CURRENCIES),
});

export const getPublicDonationBoard = createServerFn({ method: "GET" })
  .inputValidator(boardInput)
  .handler(async ({ data }) => {
    const url = process.env["SUPABASE_URL"]!;
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const db = donationClient(url, key);
    const [rows, summary] = await Promise.all([
      db.rpc("get_donation_leaderboard", { p_season_id: data.seasonId ?? undefined, p_currency: data.currency }),
      db.rpc("get_donation_summary", { p_season_id: data.seasonId ?? undefined, p_currency: data.currency }),
    ]);
    if (rows.error) throw new Error("The donation leaderboard is temporarily unavailable");
    if (summary.error) throw new Error("The donation totals are temporarily unavailable");
    return {
      rows: (rows.data ?? []).map((row) => ({ ...row, amount: row.amount == null ? null : Number(row.amount) })),
      summary: summary.data ?? {
        total_amount: 0,
        tournament_total: 0,
        maintenance_total: 0,
        developer_total: 0,
        supporter_count: 0,
        donation_count: 0,
        monthly_maintenance: 0,
      },
    };
  });

export const getDonationSeasons = createServerFn({ method: "GET" }).handler(async () => {
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const db = donationClient(url, key);
  const { data, error } = await db
    .from("sp_seasons")
    .select("id,name,starts_at,ends_at")
    .lte("starts_at", new Date().toISOString())
    .order("id", { ascending: false });
  if (error) throw new Error("Season information is temporarily unavailable");
  const now = Date.now();
  const seasons = data ?? [];
  return {
    seasons,
    currentSeasonId: seasons.find((season) => (
      now >= new Date(season.starts_at).getTime() && now < new Date(season.ends_at).getTime()
    ))?.id ?? seasons[0]?.id ?? null,
  };
});

const submissionInput = z.object({
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
});

export const submitDonation = createServerFn({ method: "POST" })
  .inputValidator(submissionInput)
  .handler(async ({ data }) => {
    const url = process.env["SUPABASE_URL"]!;
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const authorization = getRequest().headers.get("authorization") ?? undefined;
    const db = donationClient(url, key, authorization);
    const { data: id, error } = await db.rpc("submit_donation", {
      p_donor_name: data.donorName,
      p_player_key: data.playerKey || "",
      p_amount: data.amount,
      p_currency: data.currency,
      p_tournament_pct: data.allocation.tournament,
      p_maintenance_pct: data.allocation.maintenance,
      p_developer_pct: data.allocation.developer,
      p_hide_name: data.hideName,
      p_hide_amount: data.hideAmount,
      p_payment_method: data.paymentMethod,
      p_donor_note: data.donorNote || undefined,
    });
    if (error) throw new Error(error.message || "Your donation could not be submitted");
    return { id };
  });

export const getDonatorStatus = createServerFn({ method: "GET" })
  .inputValidator(z.object({ playerKey: z.string().trim().min(1).max(100) }))
  .handler(async ({ data }) => {
    const url = process.env["SUPABASE_URL"]!;
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const db = donationClient(url, key);
    const { data: keys, error } = await db.rpc("get_donator_player_keys", {
      p_player_keys: [data.playerKey.toLowerCase()],
    });
    if (error) return { isDonator: false };
    return { isDonator: (keys ?? []).length > 0 };
  });
