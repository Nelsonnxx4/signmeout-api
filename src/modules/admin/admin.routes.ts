import { Router } from "express";

import { requireAdmin, requireAuth } from "../../middleware/auth.js";
import { parseOrThrow } from "../../lib/http-error.js";
import { shirtPlacementConfigSchema } from "../signatures/placement.rules.js";
import { adminDirectoryReviewSchema, adminListQuerySchema, adminPaymentQuerySchema, adminRefundSchema } from "./admin.schema.js";
import { initiateFullPaymentRefund } from "../payments/payment.service.js";
import {
  getAdminMetrics,
  listPendingDirectoryEntries,
  listAdminAuditLogs,
  listAdminPayments,
  reviewDepartment,
  reviewSchool,
  saveShirtPlacementConfig,
} from "./admin.service.js";

export const adminRouter = Router();
adminRouter.use("/admin", requireAuth, requireAdmin);

adminRouter.get("/admin/payments", async (req, res) => {
  const query = parseOrThrow(adminPaymentQuerySchema, req.query);
  res.json({ success: true, data: await listAdminPayments(query) });
});

adminRouter.get("/admin/audit-logs", async (req, res) => {
  const query = parseOrThrow(adminListQuerySchema, req.query);
  res.json({ success: true, data: await listAdminAuditLogs(query) });
});

adminRouter.post("/admin/payments/:id/refund", async (req, res) => {
  const { reason } = parseOrThrow(adminRefundSchema, req.body);
  res.status(202).json({
    success: true,
    data: await initiateFullPaymentRefund(
      req.auth!.user.id,
      String(req.params.id),
      reason,
    ),
  });
});

adminRouter.get("/admin/metrics", async (_req, res) => {
  res.json({ success: true, data: await getAdminMetrics() });
});

adminRouter.get("/admin/directory/pending", async (_req, res) => {
  res.json({ success: true, data: await listPendingDirectoryEntries() });
});

adminRouter.patch("/admin/schools/:id", async (req, res) => {
  const input = parseOrThrow(adminDirectoryReviewSchema, req.body);
  res.json({
    success: true,
    data: await reviewSchool(req.auth!.user.id, String(req.params.id), input),
  });
});

adminRouter.patch("/admin/departments/:id", async (req, res) => {
  const input = parseOrThrow(adminDirectoryReviewSchema, req.body);
  res.json({
    success: true,
    data: await reviewDepartment(req.auth!.user.id, String(req.params.id), input),
  });
});

adminRouter.put("/admin/shirt-models/:id/placement-config", async (req, res) => {
  const placementConfig = parseOrThrow(shirtPlacementConfigSchema, req.body);
  res.json({
    success: true,
    data: await saveShirtPlacementConfig(
      req.auth!.user.id,
      String(req.params.id),
      placementConfig,
    ),
  });
});
