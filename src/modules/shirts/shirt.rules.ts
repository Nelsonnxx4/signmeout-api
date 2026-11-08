// Pure business rules: no database, no HTTP. Easy to unit test.

export type ShirtStatus = "ACTIVE" | "PAUSED" | "FULL" | "ARCHIVED";
export type ShirtType = "SHORT_SLEEVE" | "LONG_SLEEVE";

// FULL is set by the system (Phase 6, when no space remains). Owners can only archive a full shirt.
// ARCHIVED is terminal for owners; an admin can restore it. The (owner, type) slot stays used.
const OWNER_TRANSITIONS: Record<ShirtStatus, ShirtStatus[]> = {
	ACTIVE: ["PAUSED", "ARCHIVED"],
	PAUSED: ["ACTIVE", "ARCHIVED"],
	FULL: ["ARCHIVED"],
	ARCHIVED: [],
};

export const canOwnerTransition = (from: ShirtStatus, to: ShirtStatus) =>
	OWNER_TRANSITIONS[from].includes(to);

/** Phase 6 will also check remaining capacity. */
export const isSigningAvailable = (status: ShirtStatus) => status === "ACTIVE";

interface PublicShirtSource {
	slug: string;
	shirtType: ShirtType;
	status: ShirtStatus;
	owner: {
		name: string;
		ownerProfile?: { school?: { name: string; status: string } | null } | null;
	};
	modelVersion: { version: number; modelKey: string };
}

interface PublicSignatureSource {
	id: string;
	assetKey: string;
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
	const school = row.owner.ownerProfile?.school;
	return {
		slug: row.slug,
		shirtType: row.shirtType,
		ownerName: row.owner.name,
		// Pending (unreviewed, user-typed) school names are not shown publicly.
		school: school && school.status === "APPROVED" ? school.name : null,
		model: {
			version: row.modelVersion.version,
			key: row.modelVersion.modelKey,
		},
		status: row.status,
		signingAvailable: isSigningAvailable(row.status),
	};
}

export function toPublicSignature(row: PublicSignatureSource) {
	return {
		id: row.id,
		assetKey: row.assetKey,
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
