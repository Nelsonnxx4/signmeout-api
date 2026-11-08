import { describe, expect, it } from "vitest";

import { calculatePaymentAllocation } from "../../src/modules/payments/payment-allocation.service.js";

describe("calculatePaymentAllocation", () => {
  it("allocates 15% to the platform and 85% to the owner", () => {
    const allocation = calculatePaymentAllocation(600_000);

    expect(allocation.platformAmountKobo).toBe(90_000);
    expect(allocation.ownerAmountKobo).toBe(510_000);
    expect(allocation.platformBasisPoints).toBe(1_500);
    expect(allocation.ownerBasisPoints).toBe(8_500);
  });

  it("assigns an indivisible remainder to the owner", () => {
    const allocation = calculatePaymentAllocation(200_001);

    expect(allocation.platformAmountKobo).toBe(30_000);
    expect(allocation.ownerAmountKobo).toBe(170_001);
    expect(
      allocation.platformAmountKobo + allocation.ownerAmountKobo,
    ).toBe(allocation.grossAmountKobo);
  });

  it.each([0, -1, 10.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid gross amount %s",
    (grossAmountKobo) => {
      expect(() => calculatePaymentAllocation(grossAmountKobo)).toThrow(
        RangeError,
      );
    },
  );
});

