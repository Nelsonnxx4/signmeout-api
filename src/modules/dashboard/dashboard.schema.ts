import { z } from "zod";

export const walletTransactionsQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type WalletTransactionsQuery = z.infer<typeof walletTransactionsQuerySchema>;
