import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../../middleware/auth.js";
import { HttpError, parseOrThrow } from "../../lib/http-error.js";
import { createShirtSchema, updateShirtSchema } from "./shirt.schema.js";
import { SLUG_PATTERN } from "./shirt.slug.js";
import {
	createShirt,
	getPublicShirt,
	getShirt,
	listPublicSignatures,
	listShirts,
	updateShirtStatus,
} from "./shirt.service.js";

// ---- Owner (authenticated) ----
export const shirtRouter = Router();
shirtRouter.use("/shirts", requireAuth);

shirtRouter.post("/shirts", async (req, res) => {
	const { shirtType } = parseOrThrow(createShirtSchema, req.body);
	res
		.status(201)
		.json({
			success: true,
			data: await createShirt(req.auth!.user.id, shirtType),
		});
});

shirtRouter.get("/shirts", async (req, res) => {
	res.json({ success: true, data: await listShirts(req.auth!.user.id) });
});

shirtRouter.get("/shirts/:id", async (req, res) => {
	res.json({
		success: true,
		data: await getShirt(req.auth!.user.id, String(req.params.id)),
	});
});

shirtRouter.patch("/shirts/:id", async (req, res) => {
	const { status } = parseOrThrow(updateShirtSchema, req.body);
	res.json({
		success: true,
		data: await updateShirtStatus(
			req.auth!.user.id,
			String(req.params.id),
			status,
		),
	});
});

// ---- Public (no account needed) ----
export const publicShirtRouter = Router();

const publicLimiter = rateLimit({
	windowMs: 60_000,
	limit: 60,
	standardHeaders: true,
	legacyHeaders: false,
});

publicShirtRouter.get(
	"/public/shirts/:slug",
	publicLimiter,
	async (req, res) => {
		const slug = String(req.params.slug);
		if (!SLUG_PATTERN.test(slug))
			throw new HttpError(404, "SHIRT_NOT_FOUND", "Shirt not found.");
		res.json({ success: true, data: await getPublicShirt(slug) });
	},
);

publicShirtRouter.get(
	"/public/shirts/:slug/signatures",
	publicLimiter,
	async (req, res) => {
		const slug = String(req.params.slug);
		if (!SLUG_PATTERN.test(slug))
			throw new HttpError(404, "SHIRT_NOT_FOUND", "Shirt not found.");
		res.json({ success: true, data: await listPublicSignatures(slug) });
	},
);
