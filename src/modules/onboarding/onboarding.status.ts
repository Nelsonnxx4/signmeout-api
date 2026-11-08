// ADAPT: derive these from your existing versioned commission policy service so there is one source of truth.
export const COMMISSION_POLICY = {
	version: "2026-11-v1",
	platformPercent: 15,
	ownerPercent: 85,
	platformPaysFees: true,
} as const;

export type OnboardingStep = "profile" | "bank" | "commission";

export function deriveOnboardingStatus(input: {
	hasProfile: boolean;
	hasBank: boolean;
	acceptedCurrentPolicy: boolean;
}) {
	const steps = {
		profile: input.hasProfile,
		bank: input.hasBank,
		commission: input.acceptedCurrentPolicy,
	};
	const order: OnboardingStep[] = ["profile", "bank", "commission"];
	const nextStep = order.find((s) => !steps[s]) ?? null;
	return { steps, completed: nextStep === null, nextStep };
}
