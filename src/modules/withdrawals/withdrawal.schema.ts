import { z } from "zod";

export const requestWithdrawalSchema = z.object({
  amountKobo: z.number().int().positive().min(1),
});

export const reviewWithdrawalSchema = z.object({
  status: z.enum(["PENDING", "PROCESSING", "REQUIRES_ACTION", "PAID", "FAILED", "REVERSED", "CANCELLED"]),
  failureReason: z.string().max(500).optional(),
});
