import { z } from "zod";

export const adminListQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const adminPaymentQuerySchema = adminListQuerySchema.extend({
  status: z.enum(["PENDING", "AUTHORIZED", "PAID", "FAILED", "CANCELLED", "REFUNDED"]).optional(),
});
