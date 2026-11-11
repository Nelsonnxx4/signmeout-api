import { Router } from "express";

import { parseOrThrow } from "../../lib/http-error.js";
import { checkoutSchema } from "./payment.rules.js";
import {
  createCheckout,
  getPaymentStatus,
  processPaystackWebhook,
} from "./payment.service.js";

export const paymentRouter = Router();

paymentRouter.post("/public/shirts/:slug/checkout", async (req, res) => {
  const { contributorEmail, giftAmountKobo, signatureSize } = parseOrThrow(checkoutSchema, req.body);
  const slug = String(req.params.slug);

  const result = await createCheckout({
    shirtSlug: slug,
    contributorEmail,
    giftAmountKobo,
    signatureSize,
  });

  res.status(201).json({ success: true, data: result });
});

paymentRouter.get("/payments/:reference/status", async (req, res) => {
  const reference = String(req.params.reference);
  res.json({ success: true, data: await getPaymentStatus(reference) });
});

paymentRouter.post("/webhooks/paystack", async (req, res) => {
  const payload = req.body;
  const signature = req.headers["x-paystack-signature"];
  const timestampedSignature = req.headers["paystack-signature"];

  const rawBody = Buffer.isBuffer(payload)
    ? payload.toString("utf8")
    : typeof payload === "string"
      ? payload
      : JSON.stringify(payload);

  const result = await processPaystackWebhook(
    rawBody,
    Array.isArray(signature) ? signature[0] : typeof signature === "string" ? signature : undefined,
    Array.isArray(timestampedSignature)
      ? timestampedSignature[0]
      : typeof timestampedSignature === "string"
        ? timestampedSignature
        : undefined,
  );

  res.json({ success: true, data: result });
});
