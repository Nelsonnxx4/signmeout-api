import { Router } from "express";

import { requireAuth } from "../../middleware/auth.js";
import { parseOrThrow } from "../../lib/http-error.js";
import { createSignatureSchema } from "./signature.schema.js";
import { createSignature } from "./signature.service.js";

export const signatureRouter = Router();

signatureRouter.post("/signatures", requireAuth, async (req, res) => {
  const payload = parseOrThrow(createSignatureSchema, req.body);
  const signature = await createSignature({
    ...payload,
  });

  res.status(201).json({ success: true, data: signature });
});
