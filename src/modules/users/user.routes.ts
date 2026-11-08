import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";

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
