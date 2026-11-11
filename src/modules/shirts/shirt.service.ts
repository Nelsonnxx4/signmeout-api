import { prisma } from "../../config/database.js";
import { env } from "../../config/env.js";
import { HttpError } from "../../lib/http-error.js";
import { generateSlug } from "./shirt.slug.js";
import {
	canOwnerTransition,
	toPublicShirt,
	toPublicSignature,
	type ShirtStatus,
	type ShirtType,
} from "./shirt.rules.js";

const isUniqueViolation = (err: unknown) =>
	(err as { code?: string })?.code === "P2002";

const ownerSelect = {
	id: true,
	shirtType: true,
	slug: true,
	status: true,
	createdAt: true,
	updatedAt: true,
	modelVersion: { select: { version: true, modelKey: true } },
} as const;

type OwnerRow = {
	id: string;
	shirtType: string;
	slug: string;
	status: string;
	createdAt: Date;
	updatedAt: Date;
	modelVersion: { version: number; modelKey: string };
};

const toOwnerShirt = (r: OwnerRow) => ({
	...r,
	shareUrl: `${env.frontendUrl}/s/${r.slug}`,
});

export async function createShirt(ownerId: string, shirtType: ShirtType) {
	const profile = await prisma.ownerProfile.findUnique({
		where: { userId: ownerId },
		select: { onboardingCompletedAt: true },
	});
	if (!profile?.onboardingCompletedAt) {
		throw new HttpError(
			403,
			"ONBOARDING_INCOMPLETE",
			"Complete onboarding before creating a shirt.",
		);
	}

	const model = await prisma.shirtModelVersion.findFirst({
		where: { shirtType, isCurrent: true },
	});
	if (!model)
		throw new HttpError(
			503,
			"MODEL_UNAVAILABLE",
			"This shirt isn't available right now.",
		);

	const alreadyHasType = () =>
		prisma.shirt.findUnique({
			where: { ownerId_shirtType: { ownerId, shirtType } },
			select: { id: true },
		});
	const conflict = () =>
		new HttpError(
			409,
			"SHIRT_TYPE_EXISTS",
			"You already have this type of shirt.",
		);

	if (await alreadyHasType()) throw conflict();

	// The (ownerId, shirtType) unique index is the real guard against double-submits;
	// the pre-check above only gives a friendly error. A unique violation here is either
	// that race or a slug collision, so re-check before retrying with a new slug.
	for (let attempt = 0; attempt < 5; attempt++) {
		try {
			const shirt = await prisma.shirt.create({
				data: {
					ownerId,
					shirtType,
					slug: generateSlug(),
					modelVersionId: model.id,
				},
				select: ownerSelect,
			});
			return toOwnerShirt(shirt);
		} catch (err) {
			if (!isUniqueViolation(err)) throw err;
			if (await alreadyHasType()) throw conflict();
		}
	}
	throw new HttpError(
		503,
		"SLUG_GENERATION_FAILED",
		"Could not create your shirt. Please try again.",
	);
}

export async function listShirts(ownerId: string) {
	const rows = await prisma.shirt.findMany({
		where: { ownerId },
		select: ownerSelect,
		orderBy: { createdAt: "asc" },
	});
	return rows.map(toOwnerShirt);
}

async function findOwned(ownerId: string, id: string) {
	// Same 404 whether it doesn't exist or belongs to someone else: no existence leak.
	const shirt = await prisma.shirt.findFirst({
		where: { id, ownerId },
		select: ownerSelect,
	});
	if (!shirt) throw new HttpError(404, "SHIRT_NOT_FOUND", "Shirt not found.");
	return shirt;
}

export async function getShirt(ownerId: string, id: string) {
	return toOwnerShirt(await findOwned(ownerId, id));
}

export async function updateShirtStatus(
	ownerId: string,
	id: string,
	to: ShirtStatus,
) {
	const shirt = await findOwned(ownerId, id);
	if (shirt.status === to) return toOwnerShirt(shirt);
	if (!canOwnerTransition(shirt.status as ShirtStatus, to)) {
		throw new HttpError(
			409,
			"INVALID_STATUS_CHANGE",
			`A ${shirt.status.toLowerCase()} shirt can't be changed to ${to.toLowerCase()}.`,
		);
	}
	// Including the current status keeps owner changes race-safe against automatic
	// capacity updates.
	const { count } = await prisma.shirt.updateMany({
		where: { id, ownerId, status: shirt.status as ShirtStatus },
		data: { status: to },
	});
	if (count === 0)
		throw new HttpError(
			409,
			"SHIRT_CHANGED",
			"This shirt was just updated. Refresh and try again.",
		);
	return getShirt(ownerId, id);
}

export async function getPublicShirt(slug: string) {
	const row = await prisma.shirt.findUnique({
		where: { slug },
		select: {
			slug: true,
			shirtType: true,
			status: true,
			modelVersion: { select: { version: true, modelKey: true, placementConfig: true } },
			_count: {
				select: {
					payments: { where: { status: { in: ["PENDING", "PAID"] } } },
				},
			},
			owner: {
				select: {
					name: true,
					ownerProfile: {
						select: { school: { select: { name: true, status: true } } },
					},
				},
			},
		},
	});
	if (!row || row.status === "ARCHIVED")
		throw new HttpError(404, "SHIRT_NOT_FOUND", "Shirt not found.");
	const { _count, ...shirt } = row;
	return toPublicShirt({ ...shirt, reservedSigningSlots: _count.payments });
}

export async function listPublicSignatures(slug: string) {
	const row = await prisma.shirt.findUnique({
		where: { slug },
		select: {
			status: true,
			signatures: {
				where: { visibility: "VISIBLE" },
				orderBy: { submittedAt: "asc" },
				select: {
					id: true,
					assetKey: true,
					surfaceId: true,
					uvX: true,
					uvY: true,
					width: true,
					height: true,
					rotation: true,
					scale: true,
					submittedAt: true,
					visibility: true,
				},
			},
		},
	});

	if (!row || row.status === "ARCHIVED")
		throw new HttpError(404, "SHIRT_NOT_FOUND", "Shirt not found.");

	return row.signatures.map((signature) => ({
		...toPublicSignature(signature),
		assetUrl: `${env.betterAuthUrl}/api/v1/public/signatures/${signature.id}/asset`,
	}));
}
