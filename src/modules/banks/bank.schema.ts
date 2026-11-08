import { z } from "zod";

export const resolveAccountSchema = z.object({
	accountNumber: z
		.string()
		.regex(/^\d{10}$/, "Account number must be 10 digits."),
	bankCode: z.string().regex(/^\d{3,7}$/, "Invalid bank code."),
});
export type ResolveAccountInput = z.infer<typeof resolveAccountSchema>;
