import { Router } from "express";

import { prisma } from "../../config/database.js";
import { requireAdmin, requireAuth } from "../../middleware/auth.js";
import { parseOrThrow } from "../../lib/http-error.js";
import { requestWithdrawalSchema } from "./withdrawal.schema.js";
import {
  getWithdrawalSummary,
  cancelWithdrawal,
  initiateWithdrawalTransfer,
  listWithdrawals,
  requestWithdrawal,
  reconcileWithdrawalTransfer,
} from "./withdrawal.service.js";

export const withdrawalRouter = Router();

withdrawalRouter.get("/withdrawals/summary", requireAuth, async (req, res) => {
  res.json({ success: true, data: await getWithdrawalSummary(req.auth!.user.id) });
});

withdrawalRouter.get("/withdrawals", requireAuth, async (req, res) => {
  res.json({ success: true, data: await listWithdrawals(req.auth!.user.id) });
});

withdrawalRouter.post("/withdrawals", requireAuth, async (req, res) => {
  const { amountKobo, idempotencyKey } = parseOrThrow(requestWithdrawalSchema, req.body);
  res.status(201).json({
    success: true,
    data: await requestWithdrawal(req.auth!.user.id, amountKobo, idempotencyKey),
  });
});

withdrawalRouter.post("/withdrawals/:id/cancel", requireAuth, async (req, res) => {
  res.json({
    success: true,
    data: await cancelWithdrawal(req.auth!.user.id, String(req.params.id)),
  });
});

withdrawalRouter.get("/admin/withdrawals", requireAuth, requireAdmin, async (_req, res) => {
  res.json({
    success: true,
    data: await prisma.withdrawal.findMany({
      orderBy: { requestedAt: "desc" },
      include: {
        alert: {
          select: {
            emailSentAt: true,
            webhookSentAt: true,
            emailAttempts: true,
            webhookAttempts: true,
            emailLastError: true,
            webhookLastError: true,
          },
        },
      },
    }),
  });
});

withdrawalRouter.post("/admin/withdrawals/:id/transfer", requireAuth, requireAdmin, async (req, res) => {
  res.json({
    success: true,
    data: await initiateWithdrawalTransfer(
      req.auth!.user.id,
      String(req.params.id),
    ),
  });
});

withdrawalRouter.post("/admin/withdrawals/:id/reconcile", requireAuth, requireAdmin, async (req, res) => {
  res.json({
    success: true,
    data: await reconcileWithdrawalTransfer(
      req.auth!.user.id,
      String(req.params.id),
    ),
  });
});
