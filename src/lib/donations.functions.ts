import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  DONATION_CURRENCIES,
  DONATION_PAYMENT_METHODS,
  type DonationSeason,
  type DonationSummary,
  type PublicDonationRow,
} from "@/lib/donations";

async function donationRequest<T>(
  url: string,
  key: string,
  path: string,
  init: RequestInit = {},
  authorization?: string,
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("apikey", key);
  headers.set("Content-Type", "application/json");
  if (authorization) headers.set("Authorization", authorization);
  else if (!key.startsWith("sb_")) headers.set("Authorization", `Bearer ${key}`);
  const response = await fetch(`${url}/rest/v1/${path}`, { ...init, headers });
  const payload = await response.json() as { message?: string } | T;
  if (!response.ok) throw new Error((payload as { message?: string }).message || "Donation request failed");
  return payload as T;
}

const boardInput = z.object({
  seasonId: z.number().int().nullable(),
});

export const getPublicDonationBoard = createServerFn({ method: "GET" })
  .inputValidator(boardInput)
  .handler(async ({ data }) => {
    const url = process.env["SUPABASE_URL"]!;
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const args = JSON.stringify({ p_season_id: data.seasonId });
    try {
      const [rows, summary] = await Promise.all([
        donationRequest<PublicDonationRow[]>(url, key, "rpc/get_donation_leaderboard", { method: "POST", body: args }),
        donationRequest<DonationSummary[]>(url, key, "rpc/get_donation_summary", { method: "POST", body: args }),
      ]);
      return {
        rows: rows.map((row) => ({
          ...row,
          amount: row.amount == null ? null : Number(row.amount),
          amount_usd: row.amount_usd == null ? null : Number(row.amount_usd),
        })),
        summary: summary[0] ?? {
          total_amount: 0,
          tournament_total: 0,
          maintenance_total: 0,
          developer_total: 0,
          supporter_count: 0,
          donation_count: 0,
          monthly_maintenance: 0,
        },
      };
    } catch {
      throw new Error("The donation leaderboard is temporarily unavailable");
    }
  });

export const getDonationSeasons = createServerFn({ method: "GET" }).handler(async () => {
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const params = new URLSearchParams({
    select: "id,name,starts_at,ends_at",
    starts_at: `lte.${new Date().toISOString()}`,
    order: "id.desc",
  });
  try {
    const seasons = await donationRequest<DonationSeason[]>(url, key, `sp_seasons?${params.toString()}`);
    const now = Date.now();
    return {
      seasons,
      currentSeasonId: seasons.find((season) => (
        now >= new Date(season.starts_at).getTime() && now < new Date(season.ends_at).getTime()
      ))?.id ?? seasons[0]?.id ?? null,
    };
  } catch {
    throw new Error("Season information is temporarily unavailable");
  }
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
    try {
      const id = await donationRequest<string>(url, key, "rpc/submit_donation", {
        method: "POST",
        body: JSON.stringify({
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
          p_donor_note: data.donorNote || null,
        }),
      }, authorization);
      return { id };
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Your donation could not be submitted");
    }
  });

export const getDonatorStatus = createServerFn({ method: "GET" })
  .inputValidator(z.object({ playerKey: z.string().trim().min(1).max(100) }))
  .handler(async ({ data }) => {
    const url = process.env["SUPABASE_URL"]!;
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    try {
      const keys = await donationRequest<string[]>(url, key, "rpc/get_donator_player_keys", {
        method: "POST",
        body: JSON.stringify({ p_player_keys: [data.playerKey.toLowerCase()] }),
      });
      return { isDonator: keys.length > 0 };
    } catch {
      return { isDonator: false };
    }
  });
