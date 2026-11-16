import { shirtPlacementConfigSchema } from "../signatures/placement.rules.js";
import {
	DEFAULT_SIGNATURE_INK_COLOR,
	DEFAULT_SIGNATURE_PEN_WIDTH_MM,
} from "../signatures/signature-options.js";

// Pure business rules: no database, no HTTP. Easy to unit test.

export type ShirtStatus = "ACTIVE" | "PAUSED" | "FULL" | "ARCHIVED";
export type ShirtType = "SHORT_SLEEVE" | "LONG_SLEEVE";

// FULL is set automatically when no signing capacity remains. Owners can only archive it.
// ARCHIVED is terminal for owners; an admin can restore it. The (owner, type) slot stays used.
const OWNER_TRANSITIONS: Record<ShirtStatus, ShirtStatus[]> = {
	ACTIVE: ["PAUSED", "ARCHIVED"],
	PAUSED: ["ACTIVE", "ARCHIVED"],
	FULL: ["ARCHIVED"],
	ARCHIVED: [],
};

export const canOwnerTransition = (from: ShirtStatus, to: ShirtStatus) =>
	OWNER_TRANSITIONS[from].includes(to);

export const isSigningAvailable = (status: ShirtStatus) => status === "ACTIVE";

interface PublicShirtSource {
	slug: string;
	shirtType: ShirtType;
	status: ShirtStatus;
	ownerProfile: {
		user: { name: string };
		school?: { name: string; status: string } | null;
	};
	modelVersion: { version: number; modelKey: string; placementConfig?: unknown };
	reservedSigningSlots?: number;
}

interface PublicSignatureSource {
	id: string;
	assetKey: string;
	inkColor?: string;
	penWidthMm?: number;
	surfaceId: string;
	uvX: number;
	uvY: number;
	width: number;
	height: number;
	rotation: number;
	scale: number;
	submittedAt: Date;
	visibility: "VISIBLE" | "HIDDEN" | "FLAGGED";
}

/** Explicit whitelist. Never spread the database row into a public response. */
export function toPublicShirt(row: PublicShirtSource) {
	const school = row.ownerProfile.school;
	const placement = shirtPlacementConfigSchema.safeParse(row.modelVersion.placementConfig);
	const capacity = placement.success ? placement.data.maxSignatures : 0;
	const remainingSigningSlots = Math.max(0, capacity - (row.reservedSigningSlots ?? 0));
	return {
		slug: row.slug,
		shirtType: row.shirtType,
		ownerName: row.ownerProfile.user.name,
		// Pending (unreviewed, user-typed) school names are not shown publicly.
		school: school && school.status === "APPROVED" ? school.name : null,
		model: {
			version: row.modelVersion.version,
			key: row.modelVersion.modelKey,
		},
		placementConfig: placement.success ? placement.data : null,
		status: row.status,
		signingAvailable:
			isSigningAvailable(row.status) &&
			placement.success &&
			remainingSigningSlots > 0,
		signatureCapacity: capacity,
		remainingSigningSlots,
	};
}

export function toPublicSignature(row: PublicSignatureSource) {
	return {
		id: row.id,
		inkColor: row.inkColor ?? DEFAULT_SIGNATURE_INK_COLOR,
		penWidthMm: row.penWidthMm ?? DEFAULT_SIGNATURE_PEN_WIDTH_MM,
		surfaceId: row.surfaceId,
		position: {
			x: row.uvX,
			y: row.uvY,
		},
		size: {
			width: row.width,
			height: row.height,
		},
		rotation: row.rotation,
		scale: row.scale,
		submittedAt: row.submittedAt,
		visibility: row.visibility,
	};
}
