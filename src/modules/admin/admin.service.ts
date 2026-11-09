import { prisma } from "../../config/database.js";
import { HttpError } from "../../lib/http-error.js";
import {
  validateSignaturePlacement,
  type ShirtPlacementConfig,
} from "../signatures/placement.rules.js";
import type { AdminListQuery, AdminPaymentQuery } from "./admin.types.js";

async function assertCursorExists(
  model: "payment" | "adminAuditLog",
  cursor: string | undefined,
) {
  if (!cursor) return;

  const record =
    model === "payment"
      ? await prisma.payment.findUnique({ where: { id: cursor }, select: { id: true } })
      : await prisma.adminAuditLog.findUnique({ where: { id: cursor }, select: { id: true } });
  if (!record) {
    throw new HttpError(400, "INVALID_CURSOR", "The pagination cursor is invalid.");
  }
}

export async function listAdminPayments({
  cursor,
  limit,
  status,
}: AdminPaymentQuery) {
  await assertCursorExists("payment", cursor);
  const rows = await prisma.payment.findMany({
    where: status ? { status } : undefined,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      reference: true,
      provider: true,
      providerTransactionId: true,
      status: true,
      currency: true,
      giftAmountKobo: true,
      enlargementFeeKobo: true,
      grossAmountKobo: true,
      ownerAmountKobo: true,
      platformAmountKobo: true,
      createdAt: true,
      paidAt: true,
      ownerProfile: { select: { user: { select: { id: true, name: true, email: true } } } },
      shirt: { select: { id: true, slug: true, shirtType: true } },
    },
  });

  const hasMore = rows.length > limit;
  const entries = hasMore ? rows.slice(0, limit) : rows;
  return {
    entries,
    nextCursor: hasMore ? entries[entries.length - 1]?.id ?? null : null,
  };
}

export async function listAdminAuditLogs({ cursor, limit }: AdminListQuery) {
  await assertCursorExists("adminAuditLog", cursor);
  const rows = await prisma.adminAuditLog.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      admin: { select: { id: true, name: true, email: true } },
    },
  });

  const hasMore = rows.length > limit;
  const entries = hasMore ? rows.slice(0, limit) : rows;
  return {
    entries,
    nextCursor: hasMore ? entries[entries.length - 1]?.id ?? null : null,
  };
}

export async function saveShirtPlacementConfig(
  adminUserId: string,
  modelVersionId: string,
  placementConfig: ShirtPlacementConfig,
) {
  return prisma.$transaction(async (tx) => {
    const model = await tx.shirtModelVersion.findUnique({
      where: { id: modelVersionId },
      select: { id: true, version: true, shirtType: true },
    });
    if (!model) {
      throw new HttpError(404, "SHIRT_MODEL_NOT_FOUND", "Shirt model version not found.");
    }
    if (model.version !== placementConfig.version) {
      throw new HttpError(400, "PLACEMENT_VERSION_MISMATCH", "Placement configuration version must match the shirt model version.");
    }

    const signatures = await tx.signature.findMany({
      where: { shirt: { modelVersionId }, visibility: { not: "HIDDEN" } },
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
        payment: { select: { signatureSize: true } },
      },
    });
    for (const signature of signatures) {
      const siblings = signatures
        .filter((other) => other.shirtId === signature.shirtId && other !== signature)
        .map(({ surfaceId, uvX, uvY, width, height, rotation }) => ({
          surfaceId,
          uvX,
          uvY,
          width,
          height,
          rotation,
        }));
      const validation = validateSignaturePlacement(
        placementConfig,
        signature,
        siblings,
        signature.payment.signatureSize,
        signature.scale,
      );
      if (!validation.valid) {
        throw new HttpError(
          409,
          "PLACEMENT_CONFIG_INVALIDATES_SIGNATURES",
          "This configuration would invalidate one or more existing signatures.",
          { signatureId: signature.id, reason: validation.reason },
        );
      }
    }

    const updated = await tx.shirtModelVersion.update({
      where: { id: modelVersionId },
      data: { placementConfig },
      select: { id: true, shirtType: true, version: true, placementConfig: true },
    });
    await tx.adminAuditLog.create({
      data: {
        adminUserId,
        action: "shirt_model.placement_config_updated",
        resourceType: "shirt_model_version",
        resourceId: modelVersionId,
        details: {
          shirtType: model.shirtType,
          version: model.version,
          surfaceCount: placementConfig.surfaces.length,
        },
      },
    });
    return updated;
  });
}
