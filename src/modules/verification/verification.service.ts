import { prisma } from "../../config/database.js";
import { HttpError } from "../../lib/http-error.js";

export async function getVerificationStatus(userId: string) {
  const verification = await prisma.studentVerification.findFirst({
    where: { userId },
    orderBy: { submittedAt: "desc" },
    include: {
      documents: {
        select: {
          id: true,
          originalName: true,
          storageKey: true,
          mimeType: true,
          sizeBytes: true,
          checksumSha256: true,
          createdAt: true,
        },
      },
    },
  });

  if (!verification) {
    return {
      status: "NOT_SUBMITTED",
      submittedAt: null,
      reviewedAt: null,
      reviewReason: null,
      documents: [],
    };
  }

  return {
    id: verification.id,
    status: verification.status,
    submittedAt: verification.submittedAt,
    reviewedAt: verification.reviewedAt,
    reviewReason: verification.reviewReason,
    documents: verification.documents,
  };
}

export async function submitVerification(
  userId: string,
  documents: Array<{
    originalName: string;
    storageKey: string;
    mimeType: string;
    sizeBytes: number;
    checksumSha256?: string;
  }>,
) {
  if (documents.length === 0) {
    throw new HttpError(400, "NO_DOCUMENTS", "At least one verification document is required.");
  }

  const existing = await prisma.studentVerification.findFirst({
    where: { userId },
    orderBy: { submittedAt: "desc" },
  });

  if (existing && existing.status === "PENDING") {
    throw new HttpError(409, "VERIFICATION_PENDING", "A verification request is already under review.");
  }

  const verification = await prisma.$transaction(async (tx) => {
    const created = await tx.studentVerification.create({
      data: {
        userId,
        status: "PENDING",
      },
    });

    await tx.verificationDocument.createMany({
      data: documents.map((document) => ({
        verificationId: created.id,
        originalName: document.originalName,
        storageKey: document.storageKey,
        mimeType: document.mimeType,
        sizeBytes: document.sizeBytes,
        checksumSha256: document.checksumSha256 ?? null,
      })),
    });

    return created;
  });

  return {
    id: verification.id,
    status: verification.status,
    submittedAt: verification.submittedAt,
  };
}

export async function reviewVerification(
  adminUserId: string,
  verificationId: string,
  status: "APPROVED" | "REJECTED" | "REQUIRES_RESUBMISSION",
  reviewReason?: string,
) {
  return prisma.$transaction(async (tx) => {
    const verification = await tx.studentVerification.findUnique({
      where: { id: verificationId },
    });

    if (!verification) {
      throw new HttpError(404, "VERIFICATION_NOT_FOUND", "Verification request not found.");
    }

    const updated = await tx.studentVerification.update({
      where: { id: verificationId },
      data: {
        status,
        reviewReason: reviewReason ?? null,
        reviewedAt: new Date(),
        reviewedByUserId: adminUserId,
      },
    });

    await tx.adminAuditLog.create({
      data: {
        adminUserId,
        action: "verification.reviewed",
        resourceType: "student_verification",
        resourceId: verificationId,
        details: {
          fromStatus: verification.status,
          toStatus: status,
          reasonProvided: Boolean(reviewReason),
        },
      },
    });

    return updated;
  });
}

export async function listVerificationQueue() {
  return prisma.studentVerification.findMany({
    where: { status: { in: ["PENDING", "REQUIRES_RESUBMISSION"] } },
    orderBy: { submittedAt: "asc" },
    include: {
      documents: true,
      ownerProfile: {
        select: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      },
    },
  });
}
