import { Router } from "express";

import { requireAdmin, requireAuth } from "../../middleware/auth.js";
import { parseOrThrow } from "../../lib/http-error.js";
import { adminWithdrawalQuerySchema, requestWithdrawalSchema } from "./withdrawal.schema.js";
import {
  getWithdrawalSummary,
  getWithdrawal,
  cancelWithdrawal,
  initiateWithdrawalTransfer,
  listAdminWithdrawals,
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

withdrawalRouter.get("/withdrawals/:id", requireAuth, async (req, res) => {
  res.json({
    success: true,
    data: await getWithdrawal(req.auth!.user.id, String(req.params.id)),
  });
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

withdrawalRouter.get("/admin/withdrawals", requireAuth, requireAdmin, async (req, res) => {
  const query = parseOrThrow(adminWithdrawalQuerySchema, req.query);
  res.json({
    success: true,
    data: await listAdminWithdrawals(query),
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
