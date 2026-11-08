import { prisma } from "../../config/database.js";
import { HttpError } from "../../lib/http-error.js";

export async function getWithdrawalSummary(userId: string) {
  const [bank, verification, profile, ledger] = await Promise.all([
    prisma.bankAccount.findUnique({ where: { userId }, select: { id: true, bankName: true, accountNumber: true } }),
    prisma.studentVerification.findFirst({
      where: { userId, status: "APPROVED" },
      orderBy: { reviewedAt: "desc" },
      select: { id: true, status: true, reviewedAt: true },
    }),
    prisma.ownerProfile.findUnique({
      where: { userId },
      select: { onboardingCompletedAt: true },
    }),
    prisma.ledgerEntry.groupBy({
      by: ["entryType"],
      where: { ownerId: userId },
      _sum: { amountKobo: true },
    }),
  ]);

  const totalEarned = ledger
    .filter((entry) => entry.entryType === "OWNER_CREDIT")
    .reduce((sum, entry) => sum + (entry._sum.amountKobo ?? 0), 0);

  const pendingHolds = ledger
    .filter((entry) => entry.entryType === "WITHDRAWAL_HOLD")
    .reduce((sum, entry) => sum + (entry._sum.amountKobo ?? 0), 0);

  const availableBalance = Math.max(0, totalEarned - pendingHolds);

  return {
    onboardingComplete: Boolean(profile?.onboardingCompletedAt),
    hasApprovedVerification: Boolean(verification),
    hasValidBank: Boolean(bank),
    totalEarned,
    pendingHolds,
    availableBalance,
    lastWithdrawalStatus: null,
  };
}

export async function requestWithdrawal(userId: string, amountKobo: number) {
  const summary = await getWithdrawalSummary(userId);

  if (!summary.onboardingComplete) {
    throw new HttpError(409, "ONBOARDING_INCOMPLETE", "Complete onboarding before requesting a withdrawal.");
  }

  if (!summary.hasApprovedVerification) {
    throw new HttpError(403, "VERIFICATION_REQUIRED", "Verification must be approved before withdrawing funds.");
  }

  if (!summary.hasValidBank) {
    throw new HttpError(409, "BANK_REQUIRED", "Add and validate a bank account before requesting a withdrawal.");
  }

  if (amountKobo > summary.availableBalance) {
    throw new HttpError(409, "INSUFFICIENT_BALANCE", "Requested amount exceeds the available balance.");
  }

  const withdrawal = await prisma.$transaction(async (tx) => {
    const created = await tx.withdrawal.create({
      data: {
        userId,
        amountKobo,
        status: "PENDING",
      },
    });

    await tx.ledgerEntry.create({
      data: {
        ownerId: userId,
        withdrawalId: created.id,
        entryType: "WITHDRAWAL_HOLD",
        amountKobo,
        description: "Funds reserved for withdrawal request",
        sourceReference: created.id,
      },
    });

    return created;
  });

  return withdrawal;
}

export async function listWithdrawals(userId: string) {
  return prisma.withdrawal.findMany({
    where: { userId },
    orderBy: { requestedAt: "desc" },
  });
}

export async function reviewWithdrawal(
  withdrawalId: string,
  status: "PENDING" | "PROCESSING" | "REQUIRES_ACTION" | "PAID" | "FAILED" | "REVERSED" | "CANCELLED",
  failureReason?: string,
) {
  const withdrawal = await prisma.withdrawal.findUnique({ where: { id: withdrawalId } });
  if (!withdrawal) {
    throw new HttpError(404, "WITHDRAWAL_NOT_FOUND", "Withdrawal request not found.");
  }

  return prisma.withdrawal.update({
    where: { id: withdrawalId },
    data: {
      status,
      failureReason: failureReason ?? null,
      processedAt: status === "PAID" || status === "FAILED" || status === "REVERSED" ? new Date() : null,
    },
  });
}
