import { COMMISSION_POLICY_VERSION } from "../payments/payment.constants.js";

export const COMMISSION_POLICY = {
	version: COMMISSION_POLICY_VERSION,
	platformPercent: 15,
	ownerPercent: 85,
	platformPaysFees: true,
} as const;

export type OnboardingStep = "profile" | "studentVerification" | "bank" | "commission";

export function deriveOnboardingStatus(input: {
	hasProfile: boolean;
	hasStudentVerification: boolean;
	hasBank: boolean;
	acceptedCurrentPolicy: boolean;
}) {
	const steps = {
		profile: input.hasProfile,
		studentVerification: input.hasStudentVerification,
		bank: input.hasBank,
		commission: input.acceptedCurrentPolicy,
	};
	const order: OnboardingStep[] = ["profile", "studentVerification", "bank", "commission"];
	const nextStep = order.find((s) => !steps[s]) ?? null;
	return { steps, completed: nextStep === null, nextStep };
}
