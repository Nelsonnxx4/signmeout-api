import { z } from "zod";

export const createSignatureSchema = z.object({
  entitlementId: z.string().min(1),
  shirtId: z.string().min(1),
  surfaceId: z.string().min(1),
  assetKey: z.string().min(1),
  uvX: z.number().finite(),
  uvY: z.number().finite(),
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number().finite(),
  scale: z.number().positive().max(4),
});
