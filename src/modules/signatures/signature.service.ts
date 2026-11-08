import { prisma } from "../../config/database.js";
import { HttpError } from "../../lib/http-error.js";

export async function createSignature({
  entitlementId,
  shirtId,
  assetKey,
  surfaceId,
  uvX,
  uvY,
  width,
  height,
  rotation,
  scale,
}: {
  entitlementId: string;
  shirtId: string;
  assetKey: string;
  surfaceId: string;
  uvX: number;
  uvY: number;
  width: number;
  height: number;
  rotation: number;
  scale: number;
}) {
  const entitlement = await prisma.signingEntitlement.findUnique({
    where: { id: entitlementId },
    include: {
      payment: { select: { id: true, status: true, ownerId: true, signatureSize: true } },
      shirt: { select: { id: true, ownerId: true, status: true } },
    },
  });

  if (!entitlement) {
    throw new HttpError(404, "SIGNING_ENTITLEMENT_NOT_FOUND", "Signing entitlement not found.");
  }

  if (entitlement.status !== "AVAILABLE") {
    throw new HttpError(409, "SIGNING_ENTITLEMENT_USED", "This signing entitlement has already been used.");
  }

  if (entitlement.shirtId !== shirtId) {
    throw new HttpError(400, "INVALID_SIGNING_SHIRT", "The signature does not belong to this shirt.");
  }

  if (entitlement.payment.status !== "PAID") {
    throw new HttpError(409, "PAYMENT_NOT_PAID", "This signature cannot be submitted until the payment is complete.");
  }

  if (width <= 0 || height <= 0 || scale <= 0 || !Number.isFinite(uvX) || !Number.isFinite(uvY)) {
    throw new HttpError(400, "INVALID_SIGNATURE_POSITION", "The signature position is invalid.");
  }

  if (scale > entitlement.payment.signatureSize || width > 200 || height > 200) {
    throw new HttpError(400, "INVALID_SIGNATURE_SIZE", "The signature exceeds the allowed size.");
  }

  const existing = await prisma.signature.findUnique({
    where: { entitlementId },
    select: { id: true },
  });

  if (existing) {
    throw new HttpError(409, "SIGNATURE_ALREADY_EXISTS", "This entitlement has already been used.");
  }

  const signature = await prisma.$transaction(async (tx) => {
    const created = await tx.signature.create({
      data: {
        shirtId,
        paymentId: entitlement.paymentId,
        entitlementId,
        assetKey,
        surfaceId,
        uvX,
        uvY,
        width,
        height,
        rotation,
        scale,
      },
    });

    await tx.signingEntitlement.update({
      where: { id: entitlementId },
      data: { status: "USED", usedAt: new Date() },
    });

    return created;
  });

  return signature;
}
