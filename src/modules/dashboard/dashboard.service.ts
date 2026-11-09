import { prisma } from "../../config/database.js";
import { HttpError } from "../../lib/http-error.js";
import { getWithdrawalSummary } from "../withdrawals/withdrawal.service.js";
import type { WalletTransactionsQuery } from "./dashboard.schema.js";

export async function getDashboardSummary(userId: string) {
  const [payments, signatureCount, recentPayments, recentSignatures, withdrawals, wallet, verification] =
    await Promise.all([
      prisma.payment.aggregate({
        where: { ownerId: userId, status: "PAID" },
        _count: { _all: true },
        _sum: { grossAmountKobo: true, ownerAmountKobo: true },
      }),
      prisma.signature.count({ where: { shirt: { ownerId: userId } } }),
      prisma.payment.findMany({
        where: { ownerId: userId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          reference: true,
          status: true,
          grossAmountKobo: true,
          ownerAmountKobo: true,
          platformAmountKobo: true,
          createdAt: true,
          paidAt: true,
          shirt: { select: { slug: true, shirtType: true } },
        },
      }),
      prisma.signature.findMany({
        where: { shirt: { ownerId: userId } },
        orderBy: { submittedAt: "desc" },
        take: 10,
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
          shirt: { select: { slug: true, shirtType: true } },
        },
      }),
      prisma.withdrawal.findMany({
        where: { userId },
        orderBy: { requestedAt: "desc" },
        take: 10,
      }),
      getWithdrawalSummary(userId),
      prisma.studentVerification.findFirst({
        where: { userId },
        orderBy: { submittedAt: "desc" },
        select: { status: true, submittedAt: true, reviewedAt: true, reviewReason: true },
      }),
    ]);

  return {
    successfulContributionCount: payments._count._all,
    grossContributionsKobo: payments._sum.grossAmountKobo ?? 0,
    totalOwnerEarningsKobo: payments._sum.ownerAmountKobo ?? 0,
    signatureCount,
    wallet,
    verification:
      verification ?? {
        status: "NOT_SUBMITTED",
        submittedAt: null,
        reviewedAt: null,
        reviewReason: null,
      },
    recentTransactions: recentPayments,
    recentSignatures,
    withdrawals,
  };
}

export async function getWalletTransactions(
  userId: string,
  { cursor, limit }: WalletTransactionsQuery,
) {
  if (cursor) {
    const cursorEntry = await prisma.ledgerEntry.findFirst({
      where: { id: cursor, ownerId: userId },
      select: { id: true },
    });
    if (!cursorEntry) {
      throw new HttpError(400, "INVALID_CURSOR", "The transaction cursor is invalid.");
    }
  }

  const rows = await prisma.ledgerEntry.findMany({
    where: { ownerId: userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      payment: {
        select: { reference: true, status: true, grossAmountKobo: true },
      },
      withdrawal: {
        select: { id: true, status: true, amountKobo: true },
      },
    },
  });

  const hasMore = rows.length > limit;
  const entries = hasMore ? rows.slice(0, limit) : rows;

  return {
    entries,
    nextCursor: hasMore ? entries[entries.length - 1]?.id ?? null : null,
  };
}
