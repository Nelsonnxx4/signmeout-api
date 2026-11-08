import { z } from "zod";

export const verificationDocumentSchema = z.object({
  originalName: z.string().min(1).max(255),
  storageKey: z.string().min(1).max(500),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive().max(10 * 1024 * 1024),
  checksumSha256: z.string().min(1).max(128).optional(),
});

export const submitVerificationSchema = z.object({
  documents: z.array(verificationDocumentSchema).min(1),
});

export const reviewVerificationSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "REQUIRES_RESUBMISSION"]),
  reviewReason: z.string().max(500).optional(),
});
