import { z } from "zod";

export const requestWithdrawalSchema = z.object({
  amountKobo: z.number().int().positive().min(1).max(2_147_483_647),
  idempotencyKey: z.string().trim().min(1).max(128),
});

export const adminWithdrawalQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["PENDING", "PROCESSING", "REQUIRES_ACTION", "PAID", "FAILED", "REVERSED", "CANCELLED"]).optional(),
});
