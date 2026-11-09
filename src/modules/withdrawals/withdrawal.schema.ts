import { z } from "zod";

export const requestWithdrawalSchema = z.object({
  amountKobo: z.number().int().positive().min(1).max(2_147_483_647),
  idempotencyKey: z.string().trim().min(1).max(128),
});
