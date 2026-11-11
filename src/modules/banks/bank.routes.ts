import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../../middleware/auth.js";
import { parseOrThrow } from "../../lib/http-error.js";
import { getBanks, resolveBankAccount } from "./bank.service.js";
import { resolveAccountSchema } from "./bank.schema.js";

export const bankRouter = Router();

// Paystack resolve calls are rate-limited upstream, so cap them per user.
const resolveLimiter = rateLimit({
	windowMs: 60_000,
	limit: 10,
	standardHeaders: true,
	legacyHeaders: false,
	keyGenerator: (req) => req.auth!.user.id,
});

bankRouter.get("/banks", requireAuth, async (_req, res) => {
	res.json({ success: true, data: await getBanks() });
});

bankRouter.post(
	"/banks/resolve",
	requireAuth,
	resolveLimiter,
	async (req, res) => {
		const { accountNumber, bankCode } = parseOrThrow(
			resolveAccountSchema,
			req.body,
		);
		const { accountName } = await resolveBankAccount(accountNumber, bankCode);
		res.json({ success: true, data: { accountName } });
	},
);
