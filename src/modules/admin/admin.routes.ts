import { Router } from "express";

import { requireAdmin, requireAuth } from "../../middleware/auth.js";
import { parseOrThrow } from "../../lib/http-error.js";
import { shirtPlacementConfigSchema } from "../signatures/placement.rules.js";
import { adminListQuerySchema, adminPaymentQuerySchema } from "./admin.schema.js";
import {
  listAdminAuditLogs,
  listAdminPayments,
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
