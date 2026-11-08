import type { PrismaClient } from "@prisma/client"; // ADAPT: import path of your generated client

// STARTER DATA ONLY. Import the full NUC-approved list before launch, and replace the
// placeholder departments with each school's real faculties via admin curation.
const SCHOOLS: Array<{
	name: string;
	abbreviation?: string;
	type: "FEDERAL" | "STATE" | "PRIVATE";
}> = [
	{ name: "Benue State University", abbreviation: "BSU", type: "STATE" },
	{
		name: "Joseph Sarwuan Tarka University, Makurdi",
		abbreviation: "JOSTUM",
		type: "FEDERAL",
	},
	{ name: "University of Abuja", abbreviation: "UNIABUJA", type: "FEDERAL" },
	{ name: "University of Lagos", abbreviation: "UNILAG", type: "FEDERAL" },
	{ name: "University of Ibadan", abbreviation: "UI", type: "FEDERAL" },
	{
		name: "University of Nigeria, Nsukka",
		abbreviation: "UNN",
		type: "FEDERAL",
	},
	{ name: "Ahmadu Bello University", abbreviation: "ABU", type: "FEDERAL" },
	{ name: "Obafemi Awolowo University", abbreviation: "OAU", type: "FEDERAL" },
	{ name: "University of Benin", abbreviation: "UNIBEN", type: "FEDERAL" },
	{ name: "University of Jos", abbreviation: "UNIJOS", type: "FEDERAL" },
	{ name: "Bayero University Kano", abbreviation: "BUK", type: "FEDERAL" },
	{ name: "Lagos State University", abbreviation: "LASU", type: "STATE" },
	{ name: "Covenant University", abbreviation: "CU", type: "PRIVATE" },
	{ name: "Babcock University", type: "PRIVATE" },
	{ name: "Nile University of Nigeria", type: "PRIVATE" },
];

const PLACEHOLDER_DEPARTMENTS = [
	"Computer Science",
	"Software Engineering",
	"Information Technology",
	"Law",
	"Medicine and Surgery",
	"Nursing Science",
	"Accounting",
	"Business Administration",
	"Economics",
	"Mass Communication",
	"Political Science",
	"Mechanical Engineering",
	"Electrical Engineering",
	"Civil Engineering",
	"Chemical Engineering",
	"Architecture",
	"Biochemistry",
	"Microbiology",
	"Pharmacy",
	"English Language",
];

export async function seedSchools(prisma: PrismaClient) {
	for (const s of SCHOOLS) {
		const school = await prisma.school.upsert({
			where: { name: s.name },
			update: { abbreviation: s.abbreviation, type: s.type },
			create: { ...s, status: "APPROVED" },
		});
		for (const name of PLACEHOLDER_DEPARTMENTS) {
			await prisma.department.upsert({
				where: { schoolId_name: { schoolId: school.id, name } },
				update: {},
				create: { schoolId: school.id, name, status: "APPROVED" },
			});
		}
	}
}
