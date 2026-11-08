import { prisma } from "../../config/database.js"; // ADAPT
import { HttpError } from "../../lib/http-error.js";

export function listSchools() {
	return prisma.school.findMany({
		where: { active: true, status: "APPROVED" },
		select: { id: true, name: true, abbreviation: true, type: true },
		orderBy: { name: "asc" },
	});
}

export async function listDepartments(schoolId: string) {
	const school = await prisma.school.findFirst({
		where: { id: schoolId, active: true, status: "APPROVED" },
	});
	if (!school)
		throw new HttpError(404, "SCHOOL_NOT_FOUND", "School not found.");
	return prisma.department.findMany({
		where: { schoolId, active: true, status: "APPROVED" },
		select: { id: true, name: true },
		orderBy: { name: "asc" },
	});
}
