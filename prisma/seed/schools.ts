import type { PrismaClient } from "@prisma/client";

const FEDERAL_SCHOOLS = [
	"Abubakar Tafawa Balewa University",
	"Ahmadu Bello University",
	"Alvan Ikoku Federal University of Education",
	"Federal University Birnin Kebbi",
	"Federal University Dutse",
	"Federal University Lafia",
	"Federal University Lokoja",
	"Federal University of Agriculture Abeokuta",
	"Federal University of Health Sciences Otukpo",
	"Federal University of Petroleum Resources Effurun",
	"Federal University of Technology Akure",
	"Federal University of Technology Babura",
	"Federal University of Technology Minna",
	"Federal University of Technology Owerri",
	"Federal University Otuoke",
	"Federal University Wukari",
	"Michael Okpara University of Agriculture",
	"Nigerian Army University Biu",
	"Nigerian Defence Academy",
	"Nnamdi Azikiwe University",
	"Northwest University Kano",
	"Obafemi Awolowo University",
	"University of Abuja",
	"University of Agriculture Makurdi",
	"University of Benin",
	"University of Calabar",
	"University of Ibadan",
	"University of Ilorin",
	"University of Jos",
	"University of Lagos",
	"University of Maiduguri",
	"University of Nigeria",
	"University of Port Harcourt",
	"University of Uyo",
] as const;

const STATE_SCHOOLS = [
	"Abia State University",
	"Adamawa State University",
	"Adekunle Ajasin University",
	"Akwa Ibom State University",
	"Bauchi State University",
	"Benue State University",
	"Cross River University of Technology",
	"Delta State University",
	"Dennis Osadebay University",
	"Ebonyi State University",
	"Edo State University",
	"Ekiti State University",
	"Enugu State University of Science and Technology",
	"Imo State University",
	"Kaduna State University",
	"Kano University of Science and Technology",
	"Kebbi State University of Science and Technology",
	"Kogi State University",
	"Kwara State University",
	"Lagos State University",
	"Nasarawa State University",
	"Niger Delta University",
	"Ondo State University of Science and Technology",
	"Osun State University",
	"Plateau State University",
	"Rivers State University",
	"Sokoto State University",
	"Taraba State University",
	"Umaru Musa Yar’Adua University",
	"Yobe State University",
	"Zamfara State University",
] as const;

const PRIVATE_SCHOOLS = [
	"Achievers University",
	"Adeleke University",
	"Afe Babalola University",
	"Ajayi Crowther University",
	"Al-Hikmah University",
	"American University of Nigeria",
	"Arthur Jarvis University",
	"Augustine University",
	"Babcock University",
	"Baze University",
	"Bells University of Technology",
	"Benson Idahosa University",
	"Bingham University",
	"Bowen University",
	"Caleb University",
	"Caritas University",
	"Chrisland University",
	"Christopher University",
	"Clifford University",
	"Coal City University",
	"Covenant University",
	"Crawford University",
	"Crescent University",
	"Dominican University",
	"Edwin Clark University",
	"Elizade University",
	"Fountain University",
	"Godfrey Okoye University",
	"Gregory University",
	"Hallmark University",
	"Hezekiah University",
	"Igbinedion University",
	"Joseph Ayo Babalola University",
	"Kings University",
	"Landmark University",
	"Lead City University",
	"Madonna University",
	"McPherson University",
	"Mountain Top University",
	"Nile University of Nigeria",
	"Novena University",
	"Pan-Atlantic University",
	"Paul University",
	"Redeemer’s University",
	"Renaissance University",
	"Rhema University",
	"Ritman University",
	"Salem University",
	"Skyline University Nigeria",
	"Southwestern University",
	"Spiritan University",
	"Summit University",
	"Thomas Adewumi University",
	"Trinity University",
	"Veritas University",
	"Wesley University",
	"Western Delta University",
] as const;

const SCHOOL_TYPES = new Map<string, "FEDERAL" | "STATE" | "PRIVATE">([
	...FEDERAL_SCHOOLS.map((name) => [name, "FEDERAL"] as const),
	...STATE_SCHOOLS.map((name) => [name, "STATE"] as const),
	...PRIVATE_SCHOOLS.map((name) => [name, "PRIVATE"] as const),
	["Bayero University", "FEDERAL"],
	["University of Delta", "STATE"],
	["University of Mkar", "PRIVATE"],
]);

const SCHOOL_ABBREVIATIONS: Record<string, string> = {
	"Ahmadu Bello University": "ABU",
	"Bayero University": "BUK",
	"Benue State University": "BSU",
	"Covenant University": "CU",
	"Lagos State University": "LASU",
	"Obafemi Awolowo University": "OAU",
	"University of Abuja": "UNIABUJA",
	"University of Benin": "UNIBEN",
	"University of Ibadan": "UI",
	"University of Jos": "UNIJOS",
	"University of Lagos": "UNILAG",
	"University of Nigeria": "UNN",
};

const SCHOOL_NAMES = [
	...FEDERAL_SCHOOLS,
	...STATE_SCHOOLS,
	...PRIVATE_SCHOOLS,
	"Bayero University",
	"University of Delta",
	"University of Mkar",
];

const DEPARTMENTS = [
	"Accounting",
	"Architecture",
	"Business Administration",
	"Computer Science",
	"Economics",
	"Electrical Engineering",
	"Law",
	"Mass Communication",
	"Medicine and Surgery",
	"Mechanical Engineering",
] as const;

const LEGACY_PLACEHOLDER_DEPARTMENTS = [
	"Software Engineering",
	"Information Technology",
	"Nursing Science",
	"Political Science",
	"Civil Engineering",
	"Chemical Engineering",
	"Biochemistry",
	"Microbiology",
	"Pharmacy",
	"English Language",
] as const;

const LEGACY_SCHOOL_NAMES = [
	"Bayero University Kano",
	"Joseph Sarwuan Tarka University, Makurdi",
	"University of Nigeria, Nsukka",
] as const;

export async function seedSchools(prisma: PrismaClient) {
	const uniqueSchoolNames = [...new Set(SCHOOL_NAMES)];

	for (const name of uniqueSchoolNames) {
		const type = SCHOOL_TYPES.get(name);
		if (!type) {
			throw new Error(`Missing school type for "${name}".`);
		}

		const abbreviation = SCHOOL_ABBREVIATIONS[name];
		const school = await prisma.school.upsert({
			where: { name },
			update: {
				...(abbreviation ? { abbreviation } : {}),
				type,
				active: true,
				status: "APPROVED",
			},
			create: {
				name,
				...(abbreviation ? { abbreviation } : {}),
				type,
				status: "APPROVED",
			},
		});

		for (const departmentName of DEPARTMENTS) {
			await prisma.department.upsert({
				where: {
					schoolId_name: { schoolId: school.id, name: departmentName },
				},
				update: { active: true, status: "APPROVED" },
				create: {
					schoolId: school.id,
					name: departmentName,
					status: "APPROVED",
				},
			});
		}

		await prisma.department.updateMany({
			where: {
				schoolId: school.id,
				name: {
					in: [...LEGACY_PLACEHOLDER_DEPARTMENTS],
					notIn: [...DEPARTMENTS],
				},
				status: "APPROVED",
			},
			data: { active: false },
		});
	}

	await prisma.school.updateMany({
		where: { name: { in: [...LEGACY_SCHOOL_NAMES] } },
		data: { active: false },
	});
}
