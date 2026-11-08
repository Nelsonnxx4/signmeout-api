import {
  BASIS_POINTS,
  COMMISSION_POLICY_VERSION,
  OWNER_ALLOCATION_BASIS_POINTS,
  PLATFORM_COMMISSION_BASIS_POINTS,
} from "./payment.constants.js";

export interface PaymentAllocation {
  grossAmountKobo: number;
  ownerAmountKobo: number;
  platformAmountKobo: number;
  ownerBasisPoints: number;
  platformBasisPoints: number;
  commissionPolicyVersion: string;
}

export const calculatePaymentAllocation = (
  grossAmountKobo: number,
): PaymentAllocation => {
  if (!Number.isSafeInteger(grossAmountKobo) || grossAmountKobo <= 0) {
    throw new RangeError("grossAmountKobo must be a positive integer");
  }

  // Round the platform share down to a whole kobo. The owner receives any
  // indivisible remainder so the two allocations always equal the gross amount.
  const platformAmountKobo = Math.floor(
    (grossAmountKobo * PLATFORM_COMMISSION_BASIS_POINTS) / BASIS_POINTS,
  );
  const ownerAmountKobo = grossAmountKobo - platformAmountKobo;

  return {
    grossAmountKobo,
    ownerAmountKobo,
    platformAmountKobo,
    ownerBasisPoints: OWNER_ALLOCATION_BASIS_POINTS,
    platformBasisPoints: PLATFORM_COMMISSION_BASIS_POINTS,
    commissionPolicyVersion: COMMISSION_POLICY_VERSION,
  };
};

