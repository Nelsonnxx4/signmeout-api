import { Router } from "express";
import rateLimit from "express-rate-limit";

import { HttpError, parseOrThrow } from "../../lib/http-error.js";
import { getPaymentStatus } from "../payments/payment.service.js";
import { createSignatureSchema, createSignatureUploadSchema, resumeSigningSchema } from "./signature.schema.js";
import {
  createSignature,
  createSignatureUpload,
  getPublicSignatureAssetUrl,
} from "./signature.service.js";

export const signatureRouter = Router();

const signingLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

function getSigningToken(authorization: string | undefined) {
  const match = authorization?.match(/^Bearer ([^\s]+)$/);
  if (!match) {
    throw new HttpError(401, "SIGNING_TOKEN_REQUIRED", "A valid signing access token is required.");
  }
  const token = match[1];
  if (!token) {
    throw new HttpError(401, "SIGNING_TOKEN_REQUIRED", "A valid signing access token is required.");
  }
  return token;
}

signatureRouter.post("/signing/resume", signingLimiter, async (req, res) => {
  const { reference } = parseOrThrow(resumeSigningSchema, req.body);
  res.json({ success: true, data: await getPaymentStatus(reference) });
});

signatureRouter.post("/signing/assets", signingLimiter, async (req, res) => {
  const payload = parseOrThrow(createSignatureUploadSchema, req.body);
  res.status(201).json({
    success: true,
    data: await createSignatureUpload({
      ...payload,
      accessToken: getSigningToken(req.header("authorization")),
    }),
  });
});

signatureRouter.post("/signatures", signingLimiter, async (req, res) => {
  const payload = parseOrThrow(createSignatureSchema, req.body);
  const signature = await createSignature({
    ...payload,
    accessToken: getSigningToken(req.header("authorization")),
  });

  res.status(201).json({ success: true, data: signature });
});

signatureRouter.get("/public/signatures/:id/asset", signingLimiter, async (req, res) => {
  const url = await getPublicSignatureAssetUrl(String(req.params.id));
  res.setHeader("Cache-Control", "private, no-store");
  res.redirect(302, url);
});
