import { z } from "zod";

export const createSignatureSchema = z.object({
  surfaceId: z.string().min(1),
  assetKey: z.string().min(1).max(500),
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
