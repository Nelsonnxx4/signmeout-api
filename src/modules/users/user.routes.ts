import { Router } from "express";
import { prisma } from "../../config/database.js";
import { requireAuth } from "../../middleware/auth.js";
import { parseOrThrow } from "../../lib/http-error.js";
import { z } from "zod";

export const userRouter = Router();

// GET /api/v1/me
userRouter.get("/me", requireAuth, (req, res) => {
	const { user } = req.auth!;
	res.json({
		success: true,
		data: {
			id: user.id,
			name: user.name,
			email: user.email,
			emailVerified: user.emailVerified,
			role: (user as { role?: string }).role ?? "OWNER",
			createdAt: user.createdAt,
		},
	});
});

const updateMeSchema = z.object({
	name: z.string().trim().min(2).max(120),
});

userRouter.patch("/me", requireAuth, async (req, res) => {
	const { name } = parseOrThrow(updateMeSchema, req.body);
	const user = await prisma.user.update({
		where: { id: req.auth!.user.id },
		data: { name },
		select: {
			id: true,
			name: true,
			email: true,
			emailVerified: true,
			role: true,
			createdAt: true,
		},
	});

	res.json({ success: true, data: user });
});
