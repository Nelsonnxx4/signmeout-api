import type { PrismaClient } from "@prisma/client";

// These keys identify frontend-owned shirt assets. Keep them in sync with the frontend catalog.
const MODELS = [
  { shirtType: "SHORT_SLEEVE", modelKey: "models/short-sleeve-v1.glb" },
  { shirtType: "LONG_SLEEVE", modelKey: "models/long-sleeve-v1.glb" },
] as const;

export async function seedShirtModels(prisma: PrismaClient) {
  for (const m of MODELS) {
    await prisma.shirtModelVersion.upsert({
      where: { shirtType_version: { shirtType: m.shirtType, version: 1 } },
      update: {},
      create: { shirtType: m.shirtType, version: 1, modelKey: m.modelKey, isCurrent: true },
    });
  }
}
