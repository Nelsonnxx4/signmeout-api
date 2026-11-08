import type { PrismaClient } from "@prisma/client"; // ADAPT: import path of your generated client

// modelKey values are placeholders: point them at the real .glb files once the frontend has them.
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