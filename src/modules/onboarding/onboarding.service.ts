import { prisma } from "../../config/database.js"; // ADAPT
import { HttpError } from "../../lib/http-error.js";
import {
	PaystackError,
	createTransferRecipient,
	listBanks,
	resolveAccount,
} from "../../integrations/paystack/paystack.client.js";
import { mapPaystackError } from "../banks/bank.service.js";
import type { ProfileInput } from "./onboarding.schema.js";
import {
	COMMISSION_POLICY,
	deriveOnboardingStatus,
} from "./onboarding.status.js";

const maskAccount = (n: string) => `******${n.slice(-4)}`;

export async function getStatus(userId: string) {
	const [profile, bank, acceptance] = await Promise.all([
		prisma.ownerProfile.findUnique({
			where: { userId },
			include: {
				school: { select: { id: true, name: true, status: true } },
				department: { select: { id: true, name: true, status: true } },
			},
		}),
		prisma.bankAccount.findUnique({ where: { userId } }),
		prisma.commissionAcceptance.findUnique({
			where: {
				userId_policyVersion: {
					userId,
					policyVersion: COMMISSION_POLICY.version,
				},
			},
		}),
	]);

	const status = deriveOnboardingStatus({
		hasProfile: Boolean(profile?.schoolId && profile?.departmentId),
		hasBank: Boolean(bank),
		acceptedCurrentPolicy: Boolean(acceptance),
	});

	return {
		...status,
		profile:
			profile?.school && profile.department
				? { school: profile.school, department: profile.department }
				: null,
		bank: bank
			? {
					bankName: bank.bankName,
					accountName: bank.accountName,
					accountNumber: maskAccount(bank.accountNumber),
				}
			: null,
		commission: {
			policy: COMMISSION_POLICY,
			acceptedAt: acceptance?.acceptedAt ?? null,
		},
	};
}

async function markCompleteIfReady(userId: string) {
	const s = await getStatus(userId);
	if (s.completed) {
		await prisma.ownerProfile.update({
			where: { userId },
			data: { onboardingCompletedAt: new Date() },
		});
	}
	return s;
}

export async function saveProfile(userId: string, input: ProfileInput) {
	await prisma.$transaction(async (tx) => {
		// School: existing approved one, or a PENDING record for admin review.
		let schoolId = input.schoolId;
		if (schoolId) {
			const school = await tx.school.findFirst({
				where: { id: schoolId, active: true, status: "APPROVED" },
			});
			if (!school)
				throw new HttpError(404, "SCHOOL_NOT_FOUND", "School not found.");
		} else {
			const existing = await tx.school.findFirst({
				where: {
					name: { equals: input.customSchoolName!, mode: "insensitive" },
					status: { not: "REJECTED" },
				},
			});
			schoolId = (
				existing ??
				(await tx.school.create({
					data: { name: input.customSchoolName!, status: "PENDING" },
				}))
			).id;
		}

		// Department: must belong to the chosen school.
		let departmentId = input.departmentId;
		if (departmentId) {
			const dept = await tx.department.findFirst({
				where: { id: departmentId, schoolId, active: true, status: "APPROVED" },
			});
			if (!dept)
				throw new HttpError(
					404,
					"DEPARTMENT_NOT_FOUND",
					"Department not found for this school.",
				);
		} else {
			const existing = await tx.department.findFirst({
				where: {
					schoolId,
					name: { equals: input.customDepartmentName!, mode: "insensitive" },
					status: { not: "REJECTED" },
				},
			});
			departmentId = (
				existing ??
				(await tx.department.create({
					data: {
						schoolId,
						name: input.customDepartmentName!,
						status: "PENDING",
					},
				}))
			).id;
		}

		await tx.ownerProfile.upsert({
			where: { userId },
			update: { schoolId, departmentId },
			create: { userId, schoolId, departmentId },
		});
	});
	return markCompleteIfReady(userId);
}

export async function saveBank(
	userId: string,
	input: { accountNumber: string; bankCode: string },
) {
	const profile = await prisma.ownerProfile.findUnique({ where: { userId } });
	if (!profile?.schoolId)
		throw new HttpError(
			409,
			"PROFILE_REQUIRED",
			"Complete your school and department first.",
		);

	try {
		const banks = await listBanks();
		const bank = banks.find((b) => b.code === input.bankCode);
		if (!bank)
			throw new HttpError(
				400,
				"UNSUPPORTED_BANK",
				"That bank is not supported.",
			);

		// Never trust a client-supplied account name: resolve again server-side.
		const { accountName } = await resolveAccount(
			input.accountNumber,
			input.bankCode,
		);

		// Best effort: payouts (Phase 8) can create the recipient lazily if this fails.
		let recipient: string | null = null;
		try {
			recipient = await createTransferRecipient({
				name: accountName,
				accountNumber: input.accountNumber,
				bankCode: input.bankCode,
			});
		} catch (err) {
			console.warn(
				"Transfer recipient creation deferred",
				err instanceof PaystackError ? err.message : err,
			);
		}

		await prisma.bankAccount.upsert({
			where: { userId },
			update: {
				bankCode: bank.code,
				bankName: bank.name,
				accountNumber: input.accountNumber,
				accountName,
				paystackRecipient: recipient,
				verifiedAt: new Date(),
			},
			create: {
				userId,
				bankCode: bank.code,
				bankName: bank.name,
				accountNumber: input.accountNumber,
				accountName,
				paystackRecipient: recipient,
				verifiedAt: new Date(),
			},
		});
	} catch (err) {
		throw mapPaystackError(err);
	}
	return markCompleteIfReady(userId);
}

export async function acceptCommission(userId: string, policyVersion: string) {
	if (policyVersion !== COMMISSION_POLICY.version) {
		throw new HttpError(
			409,
			"POLICY_VERSION_MISMATCH",
			"The commission terms have changed. Please review the latest version.",
		);
	}
	const s = await getStatus(userId);
	if (!s.steps.profile || !s.steps.bank) {
		throw new HttpError(
			409,
			"STEPS_INCOMPLETE",
			"Complete your profile and bank details first.",
		);
	}
	await prisma.commissionAcceptance.upsert({
		where: { userId_policyVersion: { userId, policyVersion } },
		update: {},
		create: { userId, policyVersion },
	});
	return markCompleteIfReady(userId);
}
