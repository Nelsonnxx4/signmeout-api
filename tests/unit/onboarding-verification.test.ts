import { describe, expect, it } from "vitest";

import {
	studentVerificationSchema,
} from "../../src/modules/onboarding/onboarding.schema.js";
import { deriveOnboardingStatus } from "../../src/modules/onboarding/onboarding.status.js";

describe("onboarding student verification", () => {
	it("accepts full name and admission number with an optional nickname", () => {
		expect(
			studentVerificationSchema.safeParse({
				fullName: "Ada Example",
				admissionNumber: "2020/12345",
				nickname: "Ada",
			}).success,
		).toBe(true);

		expect(
			studentVerificationSchema.safeParse({
				fullName: "Ada Example",
				admissionNumber: "2020/12345",
			}).success,
		).toBe(true);
	});

	it("requires full name and admission number, with optional nickname only", () => {
		expect(studentVerificationSchema.safeParse({}).success).toBe(false);
		expect(
			studentVerificationSchema.safeParse({
				fullName: "Ada Example",
			}).success,
		).toBe(false);
		expect(
			studentVerificationSchema.safeParse({
				nickname: "Ada",
			}).success,
		).toBe(false);
		expect(
			studentVerificationSchema.safeParse({
				fullName: "Ada Example",
				admissionNumber: "2020/12345",
				nickname: "Ada",
			}).success,
		).toBe(true);
	});

	it("keeps onboarding incomplete until verification is submitted", () => {
		expect(
			deriveOnboardingStatus({
				hasProfile: true,
				hasStudentVerification: false,
				hasBank: true,
				acceptedCurrentPolicy: true,
			}),
		).toMatchObject({
			completed: false,
			nextStep: "studentVerification",
		});

		expect(
			deriveOnboardingStatus({
				hasProfile: true,
				hasStudentVerification: true,
				hasBank: true,
				acceptedCurrentPolicy: true,
			}).completed,
		).toBe(true);
	});
});
