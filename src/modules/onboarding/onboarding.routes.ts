import { Router, type Request } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { parseOrThrow } from "../../lib/http-error.js";
import {
	bankSchema,
	commissionSchema,
	profileSchema,
	studentDocumentUploadSchema,
	studentVerificationSchema,
} from "./onboarding.schema.js";
import {
	acceptCommission,
	getStatus,
	saveBank,
	saveProfile,
	createStudentDocumentUpload,
	submitStudentVerification,
} from "./onboarding.service.js";

export const onboardingRouter = Router();
onboardingRouter.use("/onboarding", requireAuth);

const uid = (req: Request) => req.auth!.user.id;

onboardingRouter.get("/onboarding/status", async (req, res) => {
	res.json({ success: true, data: await getStatus(uid(req)) });
});

onboardingRouter.patch("/onboarding/profile", async (req, res) => {
	res.json({
		success: true,
		data: await saveProfile(uid(req), parseOrThrow(profileSchema, req.body)),
	});
});

onboardingRouter.post("/onboarding/student-verification/upload", async (req, res) => {
	const { contentType, sizeBytes } = parseOrThrow(studentDocumentUploadSchema, req.body);
	res.json({
		success: true,
		data: await createStudentDocumentUpload(uid(req), contentType, sizeBytes),
	});
});

onboardingRouter.post("/onboarding/student-verification", async (req, res) => {
	const input = parseOrThrow(studentVerificationSchema, req.body);
	res.status(201).json({
		success: true,
		data: await submitStudentVerification(uid(req), input),
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
