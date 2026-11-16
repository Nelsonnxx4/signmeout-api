import { z } from "zod";

import {
  DEFAULT_SIGNATURE_INK_COLOR,
  DEFAULT_SIGNATURE_PEN_WIDTH_MM,
  SIGNATURE_INK_COLOR_IDS,
} from "./signature-options.js";

export const resumeSigningSchema = z.object({
  reference: z.string().trim().min(20).max(160),
});

export const createSignatureSchema = z.object({
  surfaceId: z.string().min(1),
  assetKey: z.string().min(1).max(500),
  inkColor: z.enum(SIGNATURE_INK_COLOR_IDS).default(DEFAULT_SIGNATURE_INK_COLOR),
  penWidthMm: z
    .union([z.literal(1.5), z.literal(2.5), z.literal(3.5)])
    .default(DEFAULT_SIGNATURE_PEN_WIDTH_MM),
  uvX: z.number().finite().min(0).max(1),
  uvY: z.number().finite().min(0).max(1),
  width: z.number().positive().max(1),
  height: z.number().positive().max(1),
  rotation: z.number().finite().min(-360).max(360),
  scale: z.number().positive().max(4),
});

export const createSignatureUploadSchema = z.object({
  contentType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  sizeBytes: z.number().int().positive().max(5 * 1024 * 1024),
});
