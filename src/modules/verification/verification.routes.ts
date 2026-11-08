import { Router } from "express";

import { requireAdmin, requireAuth } from "../../middleware/auth.js";
import { parseOrThrow } from "../../lib/http-error.js";
import { reviewVerificationSchema, submitVerificationSchema } from "./verification.schema.js";
import {
  getVerificationStatus,
  listVerificationQueue,
  reviewVerification,
  submitVerification,
} from "./verification.service.js";

export const verificationRouter = Router();

verificationRouter.get("/verification/status", requireAuth, async (req, res) => {
  res.json({ success: true, data: await getVerificationStatus(req.auth!.user.id) });
});

verificationRouter.post("/verification/submit", requireAuth, async (req, res) => {
  const payload = parseOrThrow(submitVerificationSchema, req.body);
  res.json({
    success: true,
    data: await submitVerification(req.auth!.user.id, payload.documents),
  });
});

verificationRouter.get("/admin/verifications", requireAuth, requireAdmin, async (_req, res) => {
  res.json({ success: true, data: await listVerificationQueue() });
});

verificationRouter.patch("/admin/verifications/:id/review", requireAuth, requireAdmin, async (req, res) => {
  const { status, reviewReason } = parseOrThrow(reviewVerificationSchema, req.body);
  res.json({
    success: true,
    data: await reviewVerification(
      req.auth!.user.id,
      String(req.params.id),
      status,
      reviewReason,
    ),
  });
});
