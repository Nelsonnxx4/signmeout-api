import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/database.js";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import {
  createTransferRecipient,
  initiateTransfer,
  PaystackError,
  verifyTransfer,
} from "../../integrations/paystack/paystack.client.js";
import { HttpError } from "../../lib/http-error.js";
import { calculateWithdrawalBalance, WITHDRAWAL_TRANSITIONS } from "./withdrawal.rules.js";

const isPrismaErrorCode = (error: unknown, code: string) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === code;

async function getLedgerBalance(
  userId: string,
  client: Pick<Prisma.TransactionClient, "ledgerEntry"> = prisma,
) {
  const ledger = await client.ledgerEntry.groupBy({
    by: ["entryType"],
    where: { ownerId: userId },
    _sum: { amountKobo: true },
  });

  const sumFor = (entryType: string) =>
    ledger.find((entry) => entry.entryType === entryType)?._sum.amountKobo ?? 0;

  return calculateWithdrawalBalance({
    ownerCreditsKobo: sumFor("OWNER_CREDIT"),
    withdrawalHoldsKobo: sumFor("WITHDRAWAL_HOLD"),
    withdrawalReleasesKobo: sumFor("WITHDRAWAL_RELEASE"),
    withdrawalCompletedKobo: sumFor("WITHDRAWAL_COMPLETED"),
    withdrawalReversalsKobo: sumFor("WITHDRAWAL_REVERSAL"),
  });
}

export async function getWithdrawalSummary(userId: string) {
  const [bank, profile, balance, lastWithdrawal] = await Promise.all([
    prisma.bankAccount.findUnique({
      where: { userId },
      select: { id: true, bankName: true, accountNumber: true, verifiedAt: true },
    }),
    prisma.ownerProfile.findUnique({
      where: { userId },
      select: { onboardingCompletedAt: true },
    }),
    getLedgerBalance(userId),
    prisma.withdrawal.findFirst({
      where: { userId },
      orderBy: { requestedAt: "desc" },
      select: { status: true },
    }),
  ]);

  return {
    onboardingComplete: Boolean(profile?.onboardingCompletedAt),
    hasValidBank: Boolean(bank?.verifiedAt),
    ...balance,
    lastWithdrawalStatus: lastWithdrawal?.status ?? null,
  };
}

export async function requestWithdrawal(
  userId: string,
  amountKobo: number,
  idempotencyKey: string,
) {
  const existing = await prisma.withdrawal.findUnique({
    where: { idempotencyKey },
    select: {
      id: true,
      userId: true,
      amountKobo: true,
      status: true,
      idempotencyKey: true,
      requestedAt: true,
      adminResponseDeadline: true,
      transferReference: true,
      processedAt: true,
    },
  });
  if (existing) {
    if (existing.userId !== userId || existing.amountKobo !== amountKobo) {
      throw new HttpError(409, "IDEMPOTENCY_KEY_REUSED", "This idempotency key was already used for a different request.");
    }
    return existing;
  }

  try {
    return await prisma.$transaction(
      async (tx) => {
        const [profile, bank, balance] = await Promise.all([
          tx.ownerProfile.findUnique({
            where: { userId },
            select: { onboardingCompletedAt: true },
          }),
          tx.bankAccount.findUnique({
            where: { userId },
            select: {
              bankCode: true,
              bankName: true,
              accountNumber: true,
              accountName: true,
              paystackRecipient: true,
              verifiedAt: true,
            },
          }),
          getLedgerBalance(userId, tx),
        ]);

        if (!profile?.onboardingCompletedAt) {
          throw new HttpError(409, "ONBOARDING_INCOMPLETE", "Complete onboarding before requesting a withdrawal.");
        }
        if (!bank?.verifiedAt) {
          throw new HttpError(409, "BANK_REQUIRED", "Add and validate a bank account before requesting a withdrawal.");
        }
        if (amountKobo > balance.availableBalance) {
          throw new HttpError(409, "INSUFFICIENT_BALANCE", "Requested amount exceeds the available balance.");
        }

        const adminResponseDeadline = new Date(Date.now() + 10 * 60_000);
        const withdrawal = await tx.withdrawal.create({
          data: {
            userId,
            amountKobo,
            idempotencyKey,
            status: "PENDING",
            bankCode: bank.bankCode,
            bankName: bank.bankName,
            accountNumber: bank.accountNumber,
            accountName: bank.accountName,
            paystackRecipient: bank.paystackRecipient,
            adminResponseDeadline,
            payoutNextAttemptAt: adminResponseDeadline,
          },
          select: {
            id: true,
            userId: true,
            amountKobo: true,
            status: true,
            idempotencyKey: true,
            requestedAt: true,
            adminResponseDeadline: true,
            transferReference: true,
            processedAt: true,
          },
        });

        await tx.withdrawalAlert.create({
          data: { withdrawalId: withdrawal.id },
        });

        await tx.ledgerEntry.create({
          data: {
            ownerId: userId,
            withdrawalId: withdrawal.id,
            entryType: "WITHDRAWAL_HOLD",
            amountKobo,
            description: "Funds reserved for withdrawal request",
            sourceReference: withdrawal.id,
            idempotencyKey: `${idempotencyKey}:hold`,
          },
        });

        return withdrawal;
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    if (isPrismaErrorCode(error, "P2002")) {
      const replay = await prisma.withdrawal.findUnique({
        where: { idempotencyKey },
        select: {
          id: true,
          userId: true,
          amountKobo: true,
          status: true,
          idempotencyKey: true,
          requestedAt: true,
          adminResponseDeadline: true,
          transferReference: true,
          processedAt: true,
        },
      });
      if (replay && replay.userId === userId && replay.amountKobo === amountKobo) return replay;
      if (replay) {
        throw new HttpError(409, "IDEMPOTENCY_KEY_REUSED", "This idempotency key was already used for a different request.");
      }
    }
    if (isPrismaErrorCode(error, "P2034")) {
      throw new HttpError(409, "WITHDRAWAL_RETRY_REQUIRED", "Balance changed during this request. Retry with the same idempotency key.");
    }
    throw error;
  }
}

export async function listWithdrawals(userId: string) {
  return prisma.withdrawal.findMany({
    where: { userId },
    orderBy: { requestedAt: "desc" },
    select: {
      id: true,
      amountKobo: true,
      status: true,
      requestedAt: true,
      adminResponseDeadline: true,
      processedAt: true,
      failureReason: true,
      transferReference: true,
    },
  });
}

export async function cancelWithdrawal(userId: string, withdrawalId: string) {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const withdrawal = await tx.withdrawal.findFirst({
          where: { id: withdrawalId, userId },
          select: {
            id: true,
            amountKobo: true,
            status: true,
            idempotencyKey: true,
            transferReference: true,
          },
        });
        if (!withdrawal) {
          throw new HttpError(404, "WITHDRAWAL_NOT_FOUND", "Withdrawal request not found.");
        }
        if (withdrawal.status === "CANCELLED") return withdrawal;
        if (withdrawal.status !== "PENDING" || withdrawal.transferReference) {
          throw new HttpError(
            409,
            "WITHDRAWAL_CANNOT_BE_CANCELLED",
            "A withdrawal can only be cancelled before its transfer has started.",
          );
        }

        const changed = await tx.withdrawal.updateMany({
          where: {
            id: withdrawalId,
            userId,
            status: "PENDING",
            transferReference: null,
          },
          data: { status: "CANCELLED", processedAt: new Date() },
        });
        if (changed.count !== 1) {
          throw new HttpError(
            409,
            "WITHDRAWAL_CHANGED",
            "The withdrawal changed before it could be cancelled.",
          );
        }

        await tx.ledgerEntry.create({
          data: {
            ownerId: userId,
            withdrawalId,
            entryType: "WITHDRAWAL_RELEASE",
            amountKobo: withdrawal.amountKobo,
            description: "Reserved funds released after withdrawal cancellation",
            sourceReference: withdrawal.id,
            idempotencyKey: `${withdrawal.idempotencyKey}:release`,
          },
        });

        return tx.withdrawal.findUniqueOrThrow({
          where: { id: withdrawalId },
          select: {
            id: true,
            amountKobo: true,
            status: true,
            requestedAt: true,
            adminResponseDeadline: true,
            processedAt: true,
            failureReason: true,
            transferReference: true,
          },
        });
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    if (isPrismaErrorCode(error, "P2034")) {
      throw new HttpError(
        409,
        "WITHDRAWAL_CHANGED",
        "The withdrawal changed before it could be cancelled.",
      );
    }
    throw error;
  }
}

async function applyTransferStatus({
  withdrawalId,
  eventType,
  providerStatus,
  rawPayload,
  adminUserId,
}: {
  withdrawalId: string;
  eventType: string;
  providerStatus: string;
  rawPayload: Prisma.InputJsonValue;
  adminUserId?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const withdrawal = await tx.withdrawal.findUnique({ where: { id: withdrawalId } });
    if (!withdrawal || !withdrawal.transferReference) {
      throw new HttpError(404, "WITHDRAWAL_TRANSFER_NOT_FOUND", "Transfer reference was not found.");
    }

    await tx.withdrawalEvent.create({
      data: {
        withdrawalId,
        eventType,
        providerReference: withdrawal.transferReference,
        rawPayload,
      },
    });

    const nextStatus =
      providerStatus === "success"
        ? "PAID"
        : providerStatus === "failed"
          ? "FAILED"
          : providerStatus === "reversed"
            ? "REVERSED"
            : ["otp", "requires_action"].includes(providerStatus)
              ? "REQUIRES_ACTION"
              : "PROCESSING";

    if (withdrawal.status === nextStatus) {
      return withdrawal;
    }
    if (!(WITHDRAWAL_TRANSITIONS[withdrawal.status] as readonly string[]).includes(nextStatus)) {
      return withdrawal;
    }

    const changed = await tx.withdrawal.updateMany({
      where: { id: withdrawalId, status: withdrawal.status },
      data: {
        status: nextStatus,
        failureReason: nextStatus === "FAILED" ? "Paystack confirmed transfer failure." : null,
        processedAt: ["PAID", "FAILED", "REVERSED"].includes(nextStatus) ? new Date() : null,
        payoutNextAttemptAt: nextStatus === "PROCESSING"
          ? new Date(Date.now() + 30_000)
          : null,
        payoutLockedUntil: null,
      },
    });
    if (changed.count !== 1) {
      throw new HttpError(409, "WITHDRAWAL_CHANGED", "The withdrawal changed during reconciliation.");
    }

    if (nextStatus === "PAID") {
      await tx.ledgerEntry.create({
        data: {
          ownerId: withdrawal.userId,
          withdrawalId,
          entryType: "WITHDRAWAL_COMPLETED",
          amountKobo: withdrawal.amountKobo,
          description: "Paystack confirmed withdrawal transfer",
          sourceReference: withdrawal.transferReference,
          idempotencyKey: `${withdrawal.idempotencyKey}:completed`,
        },
      });
    } else if (nextStatus === "FAILED") {
      await tx.ledgerEntry.create({
        data: {
          ownerId: withdrawal.userId,
          withdrawalId,
          entryType: "WITHDRAWAL_RELEASE",
          amountKobo: withdrawal.amountKobo,
          description: "Paystack confirmed transfer failure; reserved funds released",
          sourceReference: withdrawal.transferReference,
          idempotencyKey: `${withdrawal.idempotencyKey}:release`,
        },
      });
    } else if (nextStatus === "REVERSED") {
      await tx.ledgerEntry.create({
        data: {
          ownerId: withdrawal.userId,
          withdrawalId,
          entryType: withdrawal.status === "PAID" ? "WITHDRAWAL_REVERSAL" : "WITHDRAWAL_RELEASE",
          amountKobo: withdrawal.amountKobo,
          description: withdrawal.status === "PAID"
            ? "Paystack reversed a completed withdrawal"
            : "Paystack reversed the transfer; reserved funds released",
          sourceReference: withdrawal.transferReference,
          idempotencyKey: `${withdrawal.idempotencyKey}:reversal`,
        },
      });
    }

    if (adminUserId) {
      await tx.adminAuditLog.create({
        data: {
          adminUserId: adminUserId ?? undefined,
          action: "withdrawal.transfer_reconciled",
          resourceType: "withdrawal",
          resourceId: withdrawalId,
          details: { fromStatus: withdrawal.status, toStatus: nextStatus, providerStatus },
        },
      });
    }

    return tx.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId } });
  });
}

export async function initiateWithdrawalTransfer(
  adminUserId: string | null,
  withdrawalId: string,
) {
  if (!env.paystackTransfersEnabled) {
    throw new HttpError(503, "TRANSFERS_DISABLED", "Paystack transfers are disabled until provider and compliance approval is recorded.");
  }

  const withdrawal = await prisma.withdrawal.findUnique({ where: { id: withdrawalId } });
  if (!withdrawal) {
    throw new HttpError(404, "WITHDRAWAL_NOT_FOUND", "Withdrawal request not found.");
  }
  if (withdrawal.status !== "PENDING") {
    throw new HttpError(409, "WITHDRAWAL_NOT_READY", "Only pending withdrawals can start a transfer.");
  }
  if (withdrawal.adminResponseDeadline > new Date()) {
    throw new HttpError(
      409,
      "WITHDRAWAL_WAITING_PERIOD",
      "The 10-minute withdrawal waiting period has not ended.",
    );
  }

  if (
    !withdrawal.bankCode ||
    !withdrawal.bankName ||
    !withdrawal.accountNumber ||
    !withdrawal.accountName
  ) {
    throw new HttpError(409, "BANK_REQUIRED", "A verified payout account is required.");
  }

  let recipientCode = withdrawal.paystackRecipient;
  if (!recipientCode) {
    try {
      recipientCode = await createTransferRecipient({
        name: withdrawal.accountName,
        accountNumber: withdrawal.accountNumber,
        bankCode: withdrawal.bankCode,
      });
      await prisma.withdrawal.update({
        where: { id: withdrawal.id },
        data: { paystackRecipient: recipientCode },
      });
    } catch (error) {
      if (error instanceof PaystackError) {
        throw new HttpError(502, "TRANSFER_RECIPIENT_FAILED", "Paystack could not prepare the verified bank recipient.");
      }
      throw error;
    }
  }

  const transferReference = `SMO-TRF-${randomUUID()}`;
  const claimed = await prisma.$transaction(async (tx) => {
    const updated = await tx.withdrawal.updateMany({
      where: {
        id: withdrawalId,
        status: "PENDING",
        transferReference: null,
        adminResponseDeadline: { lte: new Date() },
      },
      data: {
        status: "PROCESSING",
        transferReference,
        payoutNextAttemptAt: new Date(Date.now() + 30_000),
      },
    });
    if (updated.count !== 1) {
      throw new HttpError(409, "WITHDRAWAL_CHANGED", "This withdrawal is already being processed.");
    }
    if (adminUserId) {
      await tx.adminAuditLog.create({
        data: {
          adminUserId: adminUserId ?? undefined,
          action: "withdrawal.transfer_initiated",
          resourceType: "withdrawal",
          resourceId: withdrawalId,
          details: { amountKobo: withdrawal.amountKobo, bankName: withdrawal.bankName },
        },
      });
    }
    return tx.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId } });
  });

  try {
    await initiateTransfer({
      amount: withdrawal.amountKobo,
      recipientCode,
      reference: transferReference,
      reason: `SignMeOut withdrawal ${withdrawal.id}`,
    });
  } catch (error) {
    if (error instanceof PaystackError && [400, 422].includes(error.status)) {
      await applyTransferStatus({
        withdrawalId,
        eventType: "transfer.initiation_rejected",
        providerStatus: "failed",
        rawPayload: { message: error.message, status: error.status },
        adminUserId: adminUserId ?? undefined,
      });
      throw new HttpError(
        502,
        "TRANSFER_REJECTED",
        "Paystack rejected the transfer. The reserved funds have been released.",
        { withdrawalId, transferReference },
      );
    }
    await prisma.withdrawal.updateMany({
      where: { id: withdrawalId, status: "PROCESSING", transferReference },
      data: { payoutNextAttemptAt: new Date(Date.now() + 30_000) },
    });
    throw new HttpError(
      502,
      "TRANSFER_RESULT_UNKNOWN",
      "The transfer response could not be confirmed. Reconcile this withdrawal before attempting another transfer.",
      { withdrawalId, transferReference, status: claimed.status },
    );
  }

  return prisma.withdrawal.findUniqueOrThrow({ where: { id: claimed.id } });
}

export async function reconcileWithdrawalTransfer(
  adminUserId: string | null,
  withdrawalId: string,
) {
  if (!env.paystackTransfersEnabled) {
    throw new HttpError(503, "TRANSFERS_DISABLED", "Paystack transfers are disabled until provider and compliance approval is recorded.");
  }

  const withdrawal = await prisma.withdrawal.findUnique({ where: { id: withdrawalId } });
  if (!withdrawal) {
    throw new HttpError(404, "WITHDRAWAL_NOT_FOUND", "Withdrawal request not found.");
  }
  if (!withdrawal.transferReference) {
    throw new HttpError(409, "TRANSFER_NOT_STARTED", "No Paystack transfer has been started for this withdrawal.");
  }

  let transfer;
  try {
    transfer = await verifyTransfer(withdrawal.transferReference);
  } catch (error) {
    if (error instanceof PaystackError) {
      throw new HttpError(502, "TRANSFER_RECONCILIATION_FAILED", "Paystack could not confirm the transfer status.");
    }
    throw error;
  }

  if (transfer.reference !== withdrawal.transferReference) {
    throw new HttpError(502, "TRANSFER_REFERENCE_MISMATCH", "Paystack returned a different transfer reference.");
  }
  if (
    transfer.status === "success" &&
    (transfer.amount !== withdrawal.amountKobo || transfer.currency !== "NGN")
  ) {
    throw new HttpError(502, "TRANSFER_AMOUNT_MISMATCH", "Paystack transfer details do not match the withdrawal.");
  }

  return applyTransferStatus({
    withdrawalId,
    eventType: "transfer.reconciled",
    providerStatus: transfer.status,
    rawPayload: transfer as unknown as Prisma.InputJsonValue,
    adminUserId: adminUserId ?? undefined,
  });
}

export async function processDueWithdrawalPayouts() {
  if (!env.paystackTransfersEnabled) return;

  const now = new Date();
  const due = await prisma.withdrawal.findMany({
    where: {
      OR: [
        {
          status: "PENDING",
          adminResponseDeadline: { lte: now },
          OR: [
            { payoutNextAttemptAt: null },
            { payoutNextAttemptAt: { lte: now } },
          ],
        },
        {
          status: "PROCESSING",
          transferReference: { not: null },
          OR: [
            { payoutNextAttemptAt: null },
            { payoutNextAttemptAt: { lte: now } },
          ],
        },
      ],
      AND: [{ OR: [{ payoutLockedUntil: null }, { payoutLockedUntil: { lt: now } }] }],
    },
    orderBy: { requestedAt: "asc" },
    take: 10,
    select: { id: true, status: true },
  });

  for (const candidate of due) {
    const conditions: Prisma.WithdrawalWhereInput[] = [
      { OR: [{ payoutLockedUntil: null }, { payoutLockedUntil: { lt: now } }] },
    ];
    if (candidate.status === "PENDING") {
      conditions.push(
        { adminResponseDeadline: { lte: now } },
        {
          OR: [
            { payoutNextAttemptAt: null },
            { payoutNextAttemptAt: { lte: now } },
          ],
        },
      );
    } else {
      conditions.push({
        transferReference: { not: null },
      });
      conditions.push({
        OR: [
          { payoutNextAttemptAt: null },
          { payoutNextAttemptAt: { lte: now } },
        ],
      });
    }

    const lockUntil = new Date(Date.now() + 60_000);
    const claim = await prisma.withdrawal.updateMany({
      where: {
        id: candidate.id,
        status: candidate.status,
        AND: conditions,
      },
      data: {
        payoutLockedUntil: lockUntil,
        payoutAttempts: { increment: 1 },
      },
    });
    if (claim.count !== 1) continue;

    try {
      if (candidate.status === "PENDING") {
        await initiateWithdrawalTransfer(null, candidate.id);
      } else {
        await reconcileWithdrawalTransfer(null, candidate.id);
      }
    } catch (error) {
      const current = await prisma.withdrawal.findUnique({
        where: { id: candidate.id },
        select: { status: true, payoutAttempts: true },
      });
      if (current && ["PENDING", "PROCESSING"].includes(current.status)) {
        const delay = current.status === "PROCESSING"
          ? 30_000
          : Math.min(15_000 * 2 ** (current.payoutAttempts - 1), 15 * 60_000);
        await prisma.withdrawal.updateMany({
          where: { id: candidate.id, payoutLockedUntil: lockUntil },
          data: { payoutNextAttemptAt: new Date(Date.now() + delay) },
        });
      }
      logger.error(
        { error, withdrawalId: candidate.id, status: current?.status },
        "Automatic withdrawal payout attempt failed",
      );
    } finally {
      await prisma.withdrawal.updateMany({
        where: { id: candidate.id, payoutLockedUntil: lockUntil },
        data: { payoutLockedUntil: null },
      });
    }
  }
}

export async function processPaystackTransferWebhook({
  eventType,
  reference,
  amount,
  currency,
  rawPayload,
}: {
  eventType: string;
  reference: string;
  amount?: number;
  currency?: string;
  rawPayload: Prisma.InputJsonValue;
}) {
  const withdrawal = await prisma.withdrawal.findUnique({
    where: { transferReference: reference },
    select: { id: true, amountKobo: true },
  });
  if (!withdrawal) {
    throw new HttpError(404, "WITHDRAWAL_TRANSFER_NOT_FOUND", "Transfer reference was not found.");
  }
  if (eventType === "transfer.success") {
    if (amount === undefined || currency === undefined) {
      const verified = await verifyTransfer(reference);
      if (
        verified.reference !== reference ||
        verified.status !== "success" ||
        verified.amount !== withdrawal.amountKobo ||
        verified.currency !== "NGN"
      ) {
        throw new HttpError(400, "TRANSFER_AMOUNT_MISMATCH", "Paystack transfer details do not match the withdrawal.");
      }
    } else if (amount !== withdrawal.amountKobo || currency !== "NGN") {
      throw new HttpError(400, "TRANSFER_AMOUNT_MISMATCH", "Paystack transfer details do not match the withdrawal.");
    }
  }

  const status =
    eventType === "transfer.success"
      ? "success"
      : eventType === "transfer.failed"
        ? "failed"
        : eventType === "transfer.reversed"
          ? "reversed"
          : "processing";

  return applyTransferStatus({
    withdrawalId: withdrawal.id,
    eventType,
    providerStatus: status,
    rawPayload,
  });
}
