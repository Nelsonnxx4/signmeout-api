import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { parseOrThrow } from "../../lib/http-error.js";
import {
	bankSchema,
	commissionSchema,
	profileSchema,
} from "./onboarding.schema.js";
import {
	acceptCommission,
	getStatus,
	saveBank,
	saveProfile,
} from "./onboarding.service.js";

export const onboardingRouter = Router();
onboardingRouter.use("/onboarding", requireAuth);

const uid = (req: Express.Request) =>
	(req as import("express").Request).auth!.user.id;

onboardingRouter.get("/onboarding/status", async (req, res) => {
	res.json({ success: true, data: await getStatus(uid(req)) });
});

onboardingRouter.patch("/onboarding/profile", async (req, res) => {
	res.json({
		success: true,
		data: await saveProfile(uid(req), parseOrThrow(profileSchema, req.body)),
	});
});

onboardingRouter.post("/onboarding/bank", async (req, res) => {
	res.json({
		success: true,
		data: await saveBank(uid(req), parseOrThrow(bankSchema, req.body)),
	});
});

onboardingRouter.post("/onboarding/commission", async (req, res) => {
	const { policyVersion } = parseOrThrow(commissionSchema, req.body);
	res.json({
		success: true,
		data: await acceptCommission(uid(req), policyVersion),
	});
});
