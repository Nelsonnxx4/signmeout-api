import { z } from "zod";
import { calculatePaymentAllocation } from "./payment-allocation.service.js";

export const MIN_GIFT_KOBO = 200_000;
export const MAX_PAYMENT_KOBO = 2_147_483_647;
export const SIGNATURE_SIZE_FEES_KOBO = {
  1: 0,
  2: 50_000,
  3: 70_000,
  4: 100_000,
} as const;

export const checkoutSchema = z.object({
  contributorEmail: z.string().trim().email().max(254),
  giftAmountKobo: z.number().int().positive().min(MIN_GIFT_KOBO).max(MAX_PAYMENT_KOBO - 100_000),
  signatureSize: z
    .number()
    .int()
    .min(1)
    .max(4)
    .default(1),
});

export const signatureSizeSchema = z.enum(["1", "2", "3", "4"]).transform((value) => Number(value));

export const getSignatureFeeKobo = (signatureSize: number) => {
  if (!Number.isInteger(signatureSize) || signatureSize < 1 || signatureSize > 4) {
    throw new RangeError("signatureSize must be between 1 and 4");
  }

  return SIGNATURE_SIZE_FEES_KOBO[signatureSize as keyof typeof SIGNATURE_SIZE_FEES_KOBO];
};

export const getValidSignatureSizes = (giftAmountKobo: number) => {
  if (giftAmountKobo < MIN_GIFT_KOBO) {
    return [] as number[];
  }

  return giftAmountKobo >= 500_000 ? [1, 2, 3, 4] : [1];
};

export function calculateCheckoutTotals(giftAmountKobo: number, signatureSize = 1) {
  if (!Number.isSafeInteger(giftAmountKobo) || giftAmountKobo <= 0) {
    throw new RangeError("giftAmountKobo must be a positive integer");
  }

  const allowedSizes = getValidSignatureSizes(giftAmountKobo);
  const size = Number(signatureSize);
  if (!allowedSizes.includes(size)) {
    throw new RangeError(`signatureSize ${size} is not allowed for this gift amount`);
  }

  const enlargementFeeKobo = getSignatureFeeKobo(size);
  const grossAmountKobo = giftAmountKobo + enlargementFeeKobo;
  if (!Number.isSafeInteger(grossAmountKobo) || grossAmountKobo > MAX_PAYMENT_KOBO) {
    throw new RangeError("grossAmountKobo exceeds the supported financial range");
  }
  return {
    ...calculatePaymentAllocation(grossAmountKobo),
    enlargementFeeKobo,
    giftAmountKobo,
    signatureSize: size,
  };
}
