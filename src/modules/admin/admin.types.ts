import type { z } from "zod";

import type { adminListQuerySchema, adminPaymentQuerySchema } from "./admin.schema.js";

export type AdminListQuery = z.infer<typeof adminListQuerySchema>;
export type AdminPaymentQuery = z.infer<typeof adminPaymentQuerySchema>;
