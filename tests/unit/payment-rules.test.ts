import { describe, expect, it } from "vitest";

import { calculateCheckoutTotals, checkoutSchema } from "../../src/modules/payments/payment.rules.js";

describe("calculateCheckoutTotals", () => {
  it("uses the PRD 85/15 split and signature-upcharge rules", () => {
    const totals = calculateCheckoutTotals(500_000, 4);

    expect(totals.giftAmountKobo).toBe(500_000);
    expect(totals.enlargementFeeKobo).toBe(100_000);
    expect(totals.grossAmountKobo).toBe(600_000);
    expect(totals.ownerAmountKobo).toBe(510_000);
    expect(totals.platformAmountKobo).toBe(90_000);
    expect(totals.ownerBasisPoints).toBe(8_500);
    expect(totals.platformBasisPoints).toBe(1_500);
    expect(totals.commissionPolicyVersion).toBe("2026-11-08-15pct-v1");
  });

  it("rejects invalid size upgrades for a small gift", () => {
    expect(() => calculateCheckoutTotals(200_000, 2)).toThrow(RangeError);
  });

  it("requires a valid contributor email for Paystack checkout", () => {
    expect(checkoutSchema.safeParse({
      contributorEmail: "friend@example.com",
      giftAmountKobo: 200_000,
    }).success).toBe(true);
    expect(checkoutSchema.safeParse({ giftAmountKobo: 200_000 }).success).toBe(false);
    expect(checkoutSchema.safeParse({
      contributorEmail: "not-an-email",
      giftAmountKobo: 200_000,
    }).success).toBe(false);
  });
});
