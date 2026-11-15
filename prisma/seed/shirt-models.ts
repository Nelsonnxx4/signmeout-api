import type { Prisma, PrismaClient } from "@prisma/client";

const MODEL_VERSION = 2;
const MAX_SIGNATURE_WIDTH = 0.16;
const MAX_SIGNATURE_HEIGHT = 0.16;

type UvBounds = readonly [
	uMin: number,
	vMin: number,
	uMax: number,
	vMax: number,
];

function insetBounds(
	[uMin, vMin, uMax, vMax]: UvBounds,
	insetRatio: number,
) {
	const insetX = (uMax - uMin) * insetRatio;
	const insetY = (vMax - vMin) * insetRatio;
	return {
		minX: uMin + insetX,
		minY: vMin + insetY,
		maxX: uMax - insetX,
		maxY: vMax - insetY,
	};
}

function placementConfig(seamInset: number): Prisma.InputJsonObject {
	const surface = (id: "front" | "back", bounds: UvBounds) => ({
		id,
		bounds: insetBounds(bounds, seamInset),
		restrictedRegions: [],
		maxSignatureWidth: MAX_SIGNATURE_WIDTH,
		maxSignatureHeight: MAX_SIGNATURE_HEIGHT,
	});

	return {
		version: MODEL_VERSION,
		maxSignatures: 200,
		surfaces: [
			surface("front", [0.1545, 0.224, 0.3605, 0.8128]),
			surface("back", [0.6395, 0.224, 0.8455, 0.8128]),
		],
	};
}

export const SHIRT_MODEL_SEEDS = [
	{
		shirtType: "SHORT_SLEEVE",
		version: MODEL_VERSION,
		modelKey: "models/shirts/short-sleeve-v2.glb",
		placementConfig: placementConfig(0.06),
	},
	{
		shirtType: "LONG_SLEEVE",
		version: MODEL_VERSION,
		modelKey: "models/shirts/long-sleeve-v2.glb",
		placementConfig: placementConfig(0.075),
	},
] as const;

export async function seedShirtModels(prisma: PrismaClient) {
	for (const modelSeed of SHIRT_MODEL_SEEDS) {
		await prisma.$transaction(async (tx) => {
			const model = await tx.shirtModelVersion.upsert({
				where: {
					shirtType_version: {
						shirtType: modelSeed.shirtType,
						version: modelSeed.version,
					},
				},
				update: {
					modelKey: modelSeed.modelKey,
					placementConfig: modelSeed.placementConfig,
				},
				create: {
					shirtType: modelSeed.shirtType,
					version: modelSeed.version,
					modelKey: modelSeed.modelKey,
					placementConfig: modelSeed.placementConfig,
					isCurrent: false,
				},
				select: { id: true },
			});

			await tx.shirtModelVersion.updateMany({
				where: {
					shirtType: modelSeed.shirtType,
					id: { not: model.id },
				},
				data: { isCurrent: false },
			});
			await tx.shirtModelVersion.update({
				where: { id: model.id },
				data: { isCurrent: true },
			});
			await tx.shirt.updateMany({
				where: {
					shirtType: modelSeed.shirtType,
					modelVersionId: { not: model.id },
				},
				data: { modelVersionId: model.id },
			});
		});
	}
}
