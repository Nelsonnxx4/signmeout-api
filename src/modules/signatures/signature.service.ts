import { prisma } from "../../config/database.js";
import { logger } from "../../config/logger.js";
import { verifySigningAccessToken } from "../../lib/signing-access.js";
import { HttpError } from "../../lib/http-error.js";
import {
  createSignatureReadUrl,
  createSignatureUploadUrl,
  deleteSignatureAsset,
  validateAndStoreSignatureAsset,
} from "../../integrations/storage/r2.client.js";
import {
  shirtPlacementConfigSchema,
  validateSignaturePlacement,
  type SignaturePlacement,
} from "./placement.rules.js";

type CreatedSignature = {
  id: string;
  shirtId: string;
  surfaceId: string;
  uvX: number;
  uvY: number;
  width: number;
  height: number;
  rotation: number;
  scale: number;
  submittedAt: Date;
};

async function findSigningEntitlement(token: string) {
  const entitlementId = verifySigningAccessToken(token);
  const entitlement = await prisma.signingEntitlement.findUnique({
    where: { id: entitlementId },
    include: {
      payment: { select: { status: true, signatureSize: true } },
      shirt: {
        select: {
          id: true,
          status: true,
          modelVersion: { select: { placementConfig: true } },
        },
      },
    },
  });

  if (!entitlement || entitlement.payment.status !== "PAID") {
    throw new HttpError(404, "SIGNING_ENTITLEMENT_NOT_FOUND", "Signing entitlement not found.");
  }
  if (entitlement.status !== "AVAILABLE") {
    throw new HttpError(409, "SIGNING_ENTITLEMENT_USED", "This signing entitlement has already been used.");
  }
  if (entitlement.shirt.status === "ARCHIVED") {
    throw new HttpError(409, "SHIRT_UNAVAILABLE", "This shirt is no longer accepting signatures.");
  }
  if (!shirtPlacementConfigSchema.safeParse(entitlement.shirt.modelVersion.placementConfig).success) {
    throw new HttpError(
      503,
      "PLACEMENT_CONFIGURATION_UNAVAILABLE",
      "Signing is not available until this shirt model has an approved placement configuration.",
    );
  }

  return entitlement;
}

export async function createSignatureUpload({
  accessToken,
  contentType,
  sizeBytes,
}: {
  accessToken: string;
  contentType: string;
  sizeBytes: number;
}) {
  const entitlement = await findSigningEntitlement(accessToken);
  const upload = await createSignatureUploadUrl(entitlement.id, contentType, sizeBytes);
  return {
    ...upload,
    shirtId: entitlement.shirtId,
    signatureSize: entitlement.payment.signatureSize,
  };
}

export async function createSignature({
  accessToken,
  assetKey,
  surfaceId,
  uvX,
  uvY,
  width,
  height,
  rotation,
  scale,
}: {
  accessToken: string;
  assetKey: string;
  surfaceId: string;
  uvX: number;
  uvY: number;
  width: number;
  height: number;
  rotation: number;
  scale: number;
}) {
  const entitlement = await findSigningEntitlement(accessToken);
  const placement: SignaturePlacement = { surfaceId, uvX, uvY, width, height, rotation };

  const canonicalAssetKey = await validateAndStoreSignatureAsset(assetKey, entitlement.id);
  let signature: CreatedSignature;
  try {
    signature = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.signature.findMany({
          where: { shirtId: entitlement.shirtId, visibility: { not: "HIDDEN" } },
          select: {
            surfaceId: true,
            uvX: true,
            uvY: true,
            width: true,
            height: true,
            rotation: true,
          },
        });

        const validation = validateSignaturePlacement(
          entitlement.shirt.modelVersion.placementConfig,
          placement,
          existing,
          entitlement.payment.signatureSize,
          scale,
        );
        if (!validation.valid) {
          const messages: Record<string, [number, string]> = {
            PLACEMENT_CONFIGURATION_UNAVAILABLE: [503, "Signing placement is not configured for this model."],
            INVALID_SIGNING_SURFACE: [400, "The selected surface is not available for signing."],
            INVALID_SIGNATURE_SIZE_OR_POSITION: [400, "The signature size or position is invalid."],
            SIGNATURE_OUT_OF_BOUNDS: [400, "The signature must fit within the allowed surface."],
            SIGNATURE_ON_RESTRICTED_REGION: [400, "The signature overlaps a restricted shirt region."],
            SIGNATURE_OVERLAP: [409, "The signature overlaps an existing signature."],
          };
          const [status, message] = messages[validation.reason] ?? [400, "The signature placement is invalid."];
          throw new HttpError(status, validation.reason, message);
        }

        const claimed = await tx.signingEntitlement.updateMany({
          where: { id: entitlement.id, status: "AVAILABLE" },
          data: { status: "USED", usedAt: new Date() },
        });
        if (claimed.count !== 1) {
          throw new HttpError(409, "SIGNING_ENTITLEMENT_USED", "This signing entitlement has already been used.");
        }

        return tx.signature.create({
          data: {
            shirtId: entitlement.shirtId,
            paymentId: entitlement.paymentId,
            entitlementId: entitlement.id,
            assetKey: canonicalAssetKey,
            surfaceId,
            uvX,
            uvY,
            width,
            height,
            rotation,
            scale,
          },
          select: {
            id: true,
            shirtId: true,
            surfaceId: true,
            uvX: true,
            uvY: true,
            width: true,
            height: true,
            rotation: true,
            scale: true,
            submittedAt: true,
          },
        });
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    try {
      await deleteSignatureAsset(canonicalAssetKey);
    } catch (cleanupError) {
      logger.error({ cleanupError, assetKey: canonicalAssetKey }, "Failed to clean up an unused signature asset");
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2034"
    ) {
      throw new HttpError(409, "SIGNATURE_PLACEMENT_RETRY", "The shirt changed while placing this signature. Refresh and retry.");
    }
    throw error;
  }

  try {
    await deleteSignatureAsset(assetKey);
  } catch (cleanupError) {
    logger.error({ cleanupError, assetKey }, "Failed to clean up an uploaded signature source asset");
  }
  return signature;
}

export async function getPublicSignatureAssetUrl(signatureId: string) {
  const signature = await prisma.signature.findFirst({
    where: { id: signatureId, visibility: "VISIBLE" },
    select: { assetKey: true },
  });
  if (!signature) {
    throw new HttpError(404, "SIGNATURE_ASSET_NOT_FOUND", "Signature asset not found.");
  }
  return createSignatureReadUrl(signature.assetKey);
}
