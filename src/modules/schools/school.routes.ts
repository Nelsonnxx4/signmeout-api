import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { listDepartments, listSchools } from "./school.service.js";

export const schoolRouter = Router();

schoolRouter.get("/schools", requireAuth, async (_req, res) => {
	res.json({ success: true, data: await listSchools() });
});

schoolRouter.get("/schools/:id/departments", requireAuth, async (req, res) => {
	res.json({
		success: true,
		data: await listDepartments(String(req.params.id)),
	});
});
