import { Router } from "express";
import { listDepartments, listSchools } from "./school.service.js";

export const schoolRouter = Router();

schoolRouter.get("/schools", async (_req, res) => {
	res.json({ success: true, data: await listSchools() });
});

schoolRouter.get("/schools/:id/departments", async (req, res) => {
	res.json({
		success: true,
		data: await listDepartments(String(req.params.id)),
	});
});
