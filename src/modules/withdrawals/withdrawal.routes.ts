import { Router } from "express";

import { prisma } from "../../config/database.js";
import { requireAdmin, requireAuth } from "../../middleware/auth.js";
import { parseOrThrow } from "../../lib/http-error.js";
import { requestWithdrawalSchema, reviewWithdrawalSchema } from "./withdrawal.schema.js";
import {
  getWithdrawalSummary,
  listWithdrawals,
  requestWithdrawal,
  reviewWithdrawal,
} from "./withdrawal.service.js";

export const withdrawalRouter = Router();

withdrawalRouter.get("/withdrawals/summary", requireAuth, async (req, res) => {
  res.json({ success: true, data: await getWithdrawalSummary(req.auth!.user.id) });
});

withdrawalRouter.get("/withdrawals", requireAuth, async (req, res) => {
  res.json({ success: true, data: await listWithdrawals(req.auth!.user.id) });
});

withdrawalRouter.post("/withdrawals", requireAuth, async (req, res) => {
  const { amountKobo } = parseOrThrow(requestWithdrawalSchema, req.body);
  res.json({ success: true, data: await requestWithdrawal(req.auth!.user.id, amountKobo) });
});

withdrawalRouter.get("/admin/withdrawals", requireAuth, requireAdmin, async (_req, res) => {
  res.json({ success: true, data: await prisma.withdrawal.findMany({ orderBy: { requestedAt: "desc" } }) });
});

withdrawalRouter.patch("/admin/withdrawals/:id/review", requireAuth, requireAdmin, async (req, res) => {
  const { status, failureReason } = parseOrThrow(reviewWithdrawalSchema, req.body);
  res.json({
    success: true,
    data: await reviewWithdrawal(String(req.params.id), status, failureReason),
  });
});
