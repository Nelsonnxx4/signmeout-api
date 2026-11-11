import { z } from "zod";

export const adminDirectoryReviewSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  active: z.boolean().optional(),
});

export const adminRefundSchema = z.object({
  reason: z.string().trim().min(10).max(500),
});

export const adminListQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const adminPaymentQuerySchema = adminListQuerySchema.extend({
  status: z.enum(["PENDING", "AUTHORIZED", "PAID", "FAILED", "CANCELLED", "REFUNDED"]).optional(),
});
