import { Router } from "express";

import { requireAuth } from "../../middleware/auth.js";
import { parseOrThrow } from "../../lib/http-error.js";
import { getWithdrawalSummary } from "../withdrawals/withdrawal.service.js";
import { walletTransactionsQuerySchema } from "./dashboard.schema.js";
import { getDashboardSummary, getWalletTransactions } from "./dashboard.service.js";

export const dashboardRouter = Router();

dashboardRouter.get("/dashboard/summary", requireAuth, async (req, res) => {
  res.json({
    success: true,
    data: await getDashboardSummary(req.auth!.user.id),
  });
});

dashboardRouter.get("/wallet/balance", requireAuth, async (req, res) => {
  res.json({
    success: true,
    data: await getWithdrawalSummary(req.auth!.user.id),
  });
});

dashboardRouter.get("/wallet/transactions", requireAuth, async (req, res) => {
  const query = parseOrThrow(walletTransactionsQuerySchema, req.query);
  res.json({
    success: true,
    data: await getWalletTransactions(req.auth!.user.id, query),
  });
});
