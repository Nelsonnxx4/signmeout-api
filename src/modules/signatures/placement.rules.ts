import { z } from "zod";

const regionSchema = z.object({
  minX: z.number().min(0).max(1),
  minY: z.number().min(0).max(1),
  maxX: z.number().min(0).max(1),
  maxY: z.number().min(0).max(1),
}).refine((region) => region.minX < region.maxX && region.minY < region.maxY);

const surfaceSchema = z.object({
  id: z.string().min(1).max(80),
  bounds: regionSchema,
  restrictedRegions: z.array(regionSchema).default([]),
  maxSignatureWidth: z.number().positive().max(1),
  maxSignatureHeight: z.number().positive().max(1),
}).refine(
  (surface) =>
    surface.maxSignatureWidth <= surface.bounds.maxX - surface.bounds.minX &&
    surface.maxSignatureHeight <= surface.bounds.maxY - surface.bounds.minY &&
    surface.restrictedRegions.every((region) => contains(surface.bounds, region)),
);

export const shirtPlacementConfigSchema = z.object({
  version: z.number().int().positive(),
  maxSignatures: z.number().int().positive().max(10_000).default(200),
  surfaces: z.array(surfaceSchema).min(1),
}).refine(
  ({ surfaces }) => new Set(surfaces.map(({ id }) => id)).size === surfaces.length,
);

export type ShirtPlacementConfig = z.infer<typeof shirtPlacementConfigSchema>;
export type SignaturePlacement = {
  surfaceId: string;
  uvX: number;
  uvY: number;
  width: number;
  height: number;
  rotation: number;
};

type Rectangle = { minX: number; minY: number; maxX: number; maxY: number };

function getRotatedBounds(placement: SignaturePlacement): Rectangle {
  const radians = (placement.rotation * Math.PI) / 180;
  const halfWidth =
    (Math.abs(Math.cos(radians)) * placement.width +
      Math.abs(Math.sin(radians)) * placement.height) /
    2;
  const halfHeight =
    (Math.abs(Math.sin(radians)) * placement.width +
      Math.abs(Math.cos(radians)) * placement.height) /
    2;

  return {
    minX: placement.uvX - halfWidth,
    minY: placement.uvY - halfHeight,
    maxX: placement.uvX + halfWidth,
    maxY: placement.uvY + halfHeight,
  };
}

function contains(bounds: Rectangle, candidate: Rectangle) {
  return (
    candidate.minX >= bounds.minX &&
    candidate.minY >= bounds.minY &&
    candidate.maxX <= bounds.maxX &&
    candidate.maxY <= bounds.maxY
  );
}

function overlaps(left: Rectangle, right: Rectangle) {
  return (
    left.minX < right.maxX &&
    left.maxX > right.minX &&
    left.minY < right.maxY &&
    left.maxY > right.minY
  );
}

export function validateSignaturePlacement(
  configValue: unknown,
  placement: SignaturePlacement,
  existing: SignaturePlacement[],
  paidScale: number,
  scale: number,
) {
  const parsed = shirtPlacementConfigSchema.safeParse(configValue);
  if (!parsed.success) {
    return { valid: false as const, reason: "PLACEMENT_CONFIGURATION_UNAVAILABLE" };
  }

  const surface = parsed.data.surfaces.find(({ id }) => id === placement.surfaceId);
  if (!surface) return { valid: false as const, reason: "INVALID_SIGNING_SURFACE" };
  if (
    ![placement.uvX, placement.uvY, placement.width, placement.height, placement.rotation, scale].every(Number.isFinite) ||
    placement.uvX < 0 ||
    placement.uvX > 1 ||
    placement.uvY < 0 ||
    placement.uvY > 1 ||
    placement.width <= 0 ||
    placement.height <= 0 ||
    placement.width > surface.maxSignatureWidth ||
    placement.height > surface.maxSignatureHeight ||
    scale <= 0 ||
    scale > paidScale
  ) {
    return { valid: false as const, reason: "INVALID_SIGNATURE_SIZE_OR_POSITION" };
  }

  const bounds = getRotatedBounds(placement);
  if (!contains(surface.bounds, bounds)) {
    return { valid: false as const, reason: "SIGNATURE_OUT_OF_BOUNDS" };
  }

  if (surface.restrictedRegions.some((region) => overlaps(region, bounds))) {
    return { valid: false as const, reason: "SIGNATURE_ON_RESTRICTED_REGION" };
  }

  if (existing.some((other) => other.surfaceId === placement.surfaceId && overlaps(bounds, getRotatedBounds(other)))) {
    return { valid: false as const, reason: "SIGNATURE_OVERLAP" };
  }

  return { valid: true as const };
}
