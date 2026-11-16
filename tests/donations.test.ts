import { describe, expect, it } from "vitest";
import {
  DEFAULT_DONATION_ALLOCATION,
  formatDonationMoney,
  isCompleteDonationAllocation,
  makeDonationPaymentNote,
  rebalanceDonationAllocation,
} from "@/lib/donations";

describe("donation allocation", () => {
  it("keeps the three requested categories at exactly 100% after every slider change", () => {
    const next = rebalanceDonationAllocation(DEFAULT_DONATION_ALLOCATION, "tournament", 70);
    expect(next).toEqual({ tournament: 70, maintenance: 18, developer: 12 });
    expect(isCompleteDonationAllocation(next)).toBe(true);
  });

  it("splits the remaining allocation when both other sliders were zero", () => {
    const next = rebalanceDonationAllocation({ tournament: 100, maintenance: 0, developer: 0 }, "tournament", 61);
    expect(next).toEqual({ tournament: 61, maintenance: 19, developer: 20 });
  });

  it("rejects incomplete or over-allocated splits", () => {
    expect(isCompleteDonationAllocation({ tournament: 50, maintenance: 40, developer: 20 })).toBe(false);
    expect(isCompleteDonationAllocation({ tournament: 101, maintenance: 0, developer: -1 })).toBe(false);
  });
});

describe("donation payment note", () => {
  it("includes the amount, exact allocation and donor identity for PayPal or Revolut", () => {
    expect(makeDonationPaymentNote({
      amount: 50,
      currency: "USD",
      allocation: DEFAULT_DONATION_ALLOCATION,
      donorName: " Mark ",
    })).toBe("StrategyArena Donation: $50.00 USD (50% Tournaments, 30% Maintenance, 20% Coffee) - IGN: Mark");
  });

  it("formats supported currencies without combining them into a single total", () => {
    expect(formatDonationMoney(25, "EUR")).toBe("€25.00");
    expect(formatDonationMoney(25, "GBP")).toBe("£25.00");
  });
});
