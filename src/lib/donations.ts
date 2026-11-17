export const DONATION_CURRENCIES = ["USD", "EUR", "GBP"] as const;
export type DonationCurrency = (typeof DONATION_CURRENCIES)[number];

// Fixed reference rates keep historical rankings stable; original amounts remain authoritative.
export const DONATION_USD_RATES: Record<DonationCurrency, number> = { USD: 1, EUR: 1.08, GBP: 1.28 };

export function approximateDonationUsd(amount: number, currency: DonationCurrency): number {
  return Math.round(amount * DONATION_USD_RATES[currency] * 100) / 100;
}

export type DonationAllocation = {
  tournament: number;
  maintenance: number;
  developer: number;
};

export const DEFAULT_DONATION_ALLOCATION: DonationAllocation = {
  tournament: 50,
  maintenance: 30,
  developer: 20,
};

export const DONATION_PAYMENT_METHODS = ["paypal", "revolut", "steam", "gift_card", "other"] as const;
export type DonationPaymentMethod = (typeof DONATION_PAYMENT_METHODS)[number];

const ALLOCATION_KEYS: Array<keyof DonationAllocation> = ["tournament", "maintenance", "developer"];
const clampPercentage = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

/** Changes one allocation slider and proportionally balances the other two to exactly 100%. */
export function rebalanceDonationAllocation(
  current: DonationAllocation,
  changed: keyof DonationAllocation,
  requested: number,
): DonationAllocation {
  const nextValue = clampPercentage(requested);
  const remaining = 100 - nextValue;
  const others = ALLOCATION_KEYS.filter((key) => key !== changed);
  const oldTotal = others.reduce((sum, key) => sum + current[key], 0);
  const firstShare = oldTotal === 0
    ? Math.floor(remaining / 2)
    : Math.round((remaining * current[others[0]]) / oldTotal);

  return {
    ...current,
    [changed]: nextValue,
    [others[0]]: firstShare,
    [others[1]]: remaining - firstShare,
  };
}

export function isCompleteDonationAllocation(allocation: DonationAllocation): boolean {
  return ALLOCATION_KEYS.every((key) => Number.isInteger(allocation[key]) && allocation[key] >= 0 && allocation[key] <= 100)
    && ALLOCATION_KEYS.reduce((sum, key) => sum + allocation[key], 0) === 100;
}

export function formatDonationMoney(amount: number, currency: DonationCurrency): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function makeDonationPaymentNote(input: {
  amount: number;
  currency: DonationCurrency;
  allocation: DonationAllocation;
  donorName: string;
}): string {
  const { allocation } = input;
  return `StrategyArena Donation: ${formatDonationMoney(input.amount, input.currency)} ${input.currency} (${allocation.tournament}% Tournaments, ${allocation.maintenance}% Maintenance, ${allocation.developer}% Coffee) - IGN: ${input.donorName.trim()}`;
}

export function donationPaymentMethodLabel(method: DonationPaymentMethod): string {
  switch (method) {
    case "paypal": return "PayPal";
    case "revolut": return "Revolut";
    case "steam": return "Steam key";
    case "gift_card": return "Digital gift card";
    case "other": return "Other";
  }
}

export type PublicDonationRow = {
  donation_id: string;
  display_name: string;
  player_key: string | null;
  amount: number | null;
  currency: DonationCurrency;
  tournament_pct: number;
  maintenance_pct: number;
  developer_pct: number;
  donated_at: string;
  donor_rank: number | null;
  amount_hidden: boolean;
  amount_usd: number | null;
};

export type DonationSummary = {
  total_amount: number;
  tournament_total: number;
  maintenance_total: number;
  developer_total: number;
  supporter_count: number;
  donation_count: number;
  monthly_maintenance: number;
};

export type DonationSeason = {
  id: number;
  name: string;
  starts_at: string;
  ends_at: string;
};
