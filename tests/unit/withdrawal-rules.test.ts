import { describe, expect, it } from "vitest";

import { calculateWithdrawalBalance } from "../../src/modules/withdrawals/withdrawal.rules.js";

describe("calculateWithdrawalBalance", () => {
  it("subtracts reserved and completed withdrawals from owner earnings", () => {
    expect(
      calculateWithdrawalBalance({
        ownerCreditsKobo: 1_000,
        withdrawalHoldsKobo: 300,
        withdrawalReleasesKobo: 100,
        withdrawalCompletedKobo: 50,
        withdrawalReversalsKobo: 0,
      }),
    ).toEqual({
      totalEarned: 1_000,
      pendingHolds: 150,
      totalWithdrawn: 50,
      availableBalance: 800,
    });
  });

  it("restores available funds after a completed withdrawal is reversed", () => {
    expect(
      calculateWithdrawalBalance({
        ownerCreditsKobo: 1_000,
        withdrawalHoldsKobo: 300,
        withdrawalReleasesKobo: 100,
        withdrawalCompletedKobo: 200,
        withdrawalReversalsKobo: 200,
      }).availableBalance,
    ).toBe(1_000);
  });

  it("rejects inconsistent ledger totals instead of hiding them", () => {
    expect(() =>
      calculateWithdrawalBalance({
        ownerCreditsKobo: 1_000,
        withdrawalHoldsKobo: 100,
        withdrawalReleasesKobo: 150,
        withdrawalCompletedKobo: 0,
        withdrawalReversalsKobo: 0,
      }),
    ).toThrow(RangeError);
  });

  it("rejects balances whose liabilities exceed earned funds", () => {
    expect(() =>
      calculateWithdrawalBalance({
        ownerCreditsKobo: 70,
        withdrawalHoldsKobo: 80,
        withdrawalReleasesKobo: 0,
        withdrawalCompletedKobo: 50,
        withdrawalReversalsKobo: 0,
      }),
    ).toThrow(RangeError);
  });
});
