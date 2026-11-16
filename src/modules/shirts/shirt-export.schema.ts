import { z } from "zod";

export const shirtExportQuerySchema = z.object({
  format: z.enum(["png", "jpeg", "pdf"]),
});

export type ShirtExportFormat = z.infer<typeof shirtExportQuerySchema>["format"];
