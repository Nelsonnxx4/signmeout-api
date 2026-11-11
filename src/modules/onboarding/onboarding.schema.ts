import { z } from "zod";
import { resolveAccountSchema } from "../banks/bank.schema.js";

const name = z.string().trim().min(2).max(120);

export const profileSchema = z
	.object({
		schoolId: z.string().min(1).optional(),
		customSchoolName: name.optional(),
		departmentId: z.string().min(1).optional(),
		customDepartmentName: name.optional(),
	})
	.refine((d) => Boolean(d.schoolId) !== Boolean(d.customSchoolName), {
		message: "Provide either schoolId or customSchoolName.",
		path: ["schoolId"],
	})
	.refine((d) => Boolean(d.departmentId) !== Boolean(d.customDepartmentName), {
		message: "Provide either departmentId or customDepartmentName.",
		path: ["departmentId"],
	})
	.refine((d) => !(d.customSchoolName && d.departmentId), {
		message: "A new school cannot use an existing department.",
		path: ["departmentId"],
	});
export type ProfileInput = z.infer<typeof profileSchema>;

export const bankSchema = resolveAccountSchema;

export const studentVerificationSchema = z
	.object({
		fullName: z.string().trim().min(2).max(150),
		admissionNumber: z.string().trim().min(2).max(64),
		nickname: z.string().trim().min(1).max(60).optional(),
	});
export type StudentVerificationInput = z.infer<typeof studentVerificationSchema>;

export const commissionSchema = z.object({
	accepted: z.literal(true, {
		error: "You must accept the commission terms to continue.",
	}),
	policyVersion: z.string().min(1),
});
