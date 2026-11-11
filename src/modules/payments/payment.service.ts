import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Payment as PaymentRecord, Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "../../config/database.js";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { HttpError } from "../../lib/http-error.js";
import { createSigningAccessToken } from "../../lib/signing-access.js";
import {
  initializeTransaction,
  createRefund,
  PaystackError,
  verifyTransaction,
} from "../../integrations/paystack/paystack.client.js";
import { isSigningAvailable } from "../shirts/shirt.rules.js";
import { shirtPlacementConfigSchema } from "../signatures/placement.rules.js";
import { processPaystackTransferWebhook } from "../withdrawals/withdrawal.service.js";
import { calculateWithdrawalBalance } from "../withdrawals/withdrawal.rules.js";
import { calculateCheckoutTotals, getValidSignatureSizes } from "./payment.rules.js";
import { enqueueEmail } from "../notifications/email-outbox.service.js";

const PAYMENT_LIFETIME_MS = 24 * 60 * 60_000;

async function reconcileShirtCapacity(
  client: Pick<Prisma.TransactionClient, "shirt">,
  shirtId: string,
) {
  const shirt = await client.shirt.findUnique({
    where: { id: shirtId },
    select: {
      status: true,
      modelVersion: { select: { placementConfig: true } },
      _count: { select: { payments: { where: { status: "PAID" } } } },
    },
  });
  if (!shirt || shirt.status === "ARCHIVED" || shirt.status === "PAUSED") return;
  const placement = shirtPlacementConfigSchema.safeParse(shirt.modelVersion.placementConfig);
  if (!placement.success) return;
  const nextStatus = shirt._count.payments >= placement.data.maxSignatures ? "FULL" : "ACTIVE";
  if (shirt.status !== nextStatus) {
    await client.shirt.updateMany({
      where: { id: shirtId, status: shirt.status },
      data: { status: nextStatus },
    });
  }
}

function toPaymentStatusResponse(
  payment: PaymentRecord & {
    entitlements: Array<{ id: string; status: string }>;
  },
) {
  const entitlement = payment.entitlements[0];
  return {
    id: payment.id,
    status: payment.status,
    reference: payment.reference,
    grossAmountKobo: payment.grossAmountKobo,
    ownerAmountKobo: payment.ownerAmountKobo,
    platformAmountKobo: payment.platformAmountKobo,
    processingFeeKobo: payment.processingFeeKobo,
    signatureSize: payment.signatureSize,
    ownerBasisPoints: payment.ownerBasisPoints,
    platformBasisPoints: payment.platformBasisPoints,
    commissionPolicyVersion: payment.commissionPolicyVersion,
    giftAmountKobo: payment.giftAmountKobo,
    enlargementFeeKobo: payment.enlargementFeeKobo,
    paidAt: payment.paidAt,
    createdAt: payment.createdAt,
    signing:
      payment.status === "PAID" && entitlement
        ? {
            entitlementId: entitlement.id,
            status: entitlement.status,
            accessToken: createSigningAccessToken(entitlement.id),
          }
        : null,
  };
}

async function findPaymentForStatus(reference: string) {
  return prisma.payment.findUnique({
    where: { reference },
    include: {
      entitlements: { select: { id: true, status: true } },
    },
  });
}

async function recordSuccessfulPayment(
  payment: PaymentRecord,
  providerData: {
    status?: string;
    amount?: number;
    currency?: string;
    id?: number | string;
    fees?: number;
  },
  eventType: string,
  rawPayload: Prisma.InputJsonValue,
) {
  if (
    providerData.status !== "success" ||
    providerData.currency !== "NGN" ||
    providerData.amount === undefined
  ) {
    throw new HttpError(400, "PAYMENT_NOT_VERIFIED", "Provider payment details do not match the expected NGN checkout.");
  }
  if (providerData.amount !== payment.grossAmountKobo) {
    throw new HttpError(400, "PAYMENT_AMOUNT_MISMATCH", "Payment amount does not match the verified checkout total.");
  }

  return prisma.$transaction(async (txClient) => {
    const transitioned = await txClient.payment.updateMany({
      where: { id: payment.id, status: "PENDING" },
      data: {
        status: "PAID",
        providerTransactionId: providerData.id === undefined ? null : String(providerData.id),
        processingFeeKobo: providerData.fees ?? 0,
        paidAt: new Date(),
        nextReconciliationAt: null,
      },
    });

    await txClient.paymentEvent.create({
      data: { paymentId: payment.id, eventType, rawPayload },
    });

    if (transitioned.count === 0) {
      const current = await txClient.payment.findUnique({
        where: { id: payment.id },
        select: { status: true },
      });
      return current?.status ?? payment.status;
    }

    if (!payment.shirtId) {
      throw new HttpError(409, "PAYMENT_SHIRT_MISSING", "Payment is not associated with a shirt.");
    }

    await txClient.signingEntitlement.create({
      data: { paymentId: payment.id, shirtId: payment.shirtId, status: "AVAILABLE" },
    });
    const ledgerEntries: Prisma.LedgerEntryCreateManyInput[] = [
        {
          ownerId: payment.ownerId,
          paymentId: payment.id,
          entryType: "OWNER_CREDIT",
          amountKobo: payment.ownerAmountKobo,
          description: "Owner share from successful payment",
          sourceReference: payment.reference,
          idempotencyKey: `${payment.reference}:owner-credit`,
        },
        {
          ownerId: null,
          paymentId: payment.id,
          entryType: "PLATFORM_REVENUE",
          amountKobo: payment.platformAmountKobo,
          description: "Platform commission from successful payment",
          sourceReference: payment.reference,
          idempotencyKey: `${payment.reference}:platform-revenue`,
        },
      ];
    if (providerData.fees && providerData.fees > 0) {
      ledgerEntries.push({
        ownerId: null,
        paymentId: payment.id,
        entryType: "GATEWAY_FEE",
        amountKobo: -providerData.fees,
        description: "Paystack processing fee",
        sourceReference: payment.reference,
        idempotencyKey: `${payment.reference}:gateway-fee`,
      });
    }
    await txClient.ledgerEntry.createMany({
      data: ledgerEntries,
    });
    await reconcileShirtCapacity(txClient, payment.shirtId);
    const owner = await txClient.user.findUnique({
      where: { id: payment.ownerId },
      select: { email: true, name: true },
    });
    if (owner) {
      await enqueueEmail(txClient, {
        eventType: "contribution.received",
        recipient: owner.email,
        subject: "You received a new SignMeOut contribution",
        body: `${owner.name}, you received a contribution of NGN ${(payment.grossAmountKobo / 100).toFixed(2)}. Your owner allocation is NGN ${(payment.ownerAmountKobo / 100).toFixed(2)}.`,
        idempotencyKey: `${payment.reference}:owner-contribution-email`,
      });
    }
    await enqueueEmail(txClient, {
      eventType: "payment.receipt",
      recipient: payment.contributorEmail,
      subject: "Your SignMeOut payment was successful",
      body: `Your payment of NGN ${(payment.grossAmountKobo / 100).toFixed(2)} was successful. Reference: ${payment.reference}. You can now complete your signature.`,
      idempotencyKey: `${payment.reference}:contributor-receipt-email`,
    });
    return "PAID";
  });
}

export async function getPaymentStatus(reference: string) {
  let payment = await findPaymentForStatus(reference);
  if (!payment) {
    throw new HttpError(404, "PAYMENT_NOT_FOUND", "Payment not found.");
  }

  if (payment.status === "PENDING") {
    const pendingPayment = payment;
    let providerData;
    try {
      providerData = await verifyTransaction(pendingPayment.reference);
    } catch (error) {
      if (error instanceof PaystackError) {
        throw new HttpError(502, "PAYMENT_RECONCILIATION_FAILED", "Paystack could not confirm the payment status.");
      }
      throw error;
    }

    if (providerData.reference !== pendingPayment.reference) {
      throw new HttpError(502, "PAYMENT_REFERENCE_MISMATCH", "Paystack returned a different payment reference.");
    }
    if (providerData.status === "success") {
      await recordSuccessfulPayment(
        pendingPayment,
        providerData,
        "transaction.reconciled",
        providerData as unknown as Prisma.InputJsonValue,
      );
    } else if (["failed", "abandoned", "reversed"].includes(providerData.status)) {
      const nextStatus = providerData.status === "failed" ? "FAILED" : "CANCELLED";
      await prisma.$transaction(async (tx) => {
        await tx.paymentEvent.create({
          data: {
            paymentId: pendingPayment.id,
            eventType: `transaction.reconciled_${providerData.status}`,
            rawPayload: providerData as unknown as Prisma.InputJsonValue,
          },
        });
        await tx.payment.updateMany({
          where: { id: pendingPayment.id, status: "PENDING" },
          data: { status: nextStatus, nextReconciliationAt: null },
        });
      });
    }

    payment = await findPaymentForStatus(reference);
    if (!payment) {
      throw new HttpError(404, "PAYMENT_NOT_FOUND", "Payment not found.");
    }
  }

  return toPaymentStatusResponse(payment);
}

export async function createCheckout({
  shirtSlug,
  contributorEmail,
  giftAmountKobo,
  signatureSize,
}: {
  shirtSlug: string;
  contributorEmail: string;
  giftAmountKobo: number;
  signatureSize?: number;
}) {
  const validSizes = getValidSignatureSizes(giftAmountKobo);
  const requestedSize = signatureSize ?? 1;
  if (!validSizes.includes(requestedSize)) {
    throw new HttpError(
      400,
      "INVALID_SIGNATURE_SIZE",
      `Signature size ${requestedSize} is not eligible for a gift of ${giftAmountKobo} kobo.`,
    );
  }

  const totals = calculateCheckoutTotals(giftAmountKobo, requestedSize);
  const grossAmountKobo = totals.grossAmountKobo;
  const ownerAmountKobo = totals.ownerAmountKobo;
  const platformAmountKobo = totals.platformAmountKobo;

  let checkout;
  try {
    checkout = await prisma.$transaction(
      async (tx) => {
        const shirt = await tx.shirt.findUnique({
          where: { slug: shirtSlug },
          select: {
            id: true,
            ownerId: true,
            status: true,
            slug: true,
            shirtType: true,
            modelVersion: { select: { placementConfig: true } },
          },
        });
        if (!shirt || shirt.status === "ARCHIVED") {
          throw new HttpError(404, "SHIRT_NOT_FOUND", "Shirt not found.");
        }
        if (!isSigningAvailable(shirt.status)) {
          throw new HttpError(409, "SHIRT_UNAVAILABLE", "This shirt is not accepting signatures right now.");
        }
        const placement = shirtPlacementConfigSchema.safeParse(shirt.modelVersion.placementConfig);
        if (!placement.success) {
          throw new HttpError(409, "SIGNING_NOT_CONFIGURED", "This shirt is not ready to accept paid signatures yet.");
        }
        const reservedSlots = await tx.payment.count({
          where: { shirtId: shirt.id, status: { in: ["PENDING", "PAID"] } },
        });
        if (reservedSlots >= placement.data.maxSignatures) {
          throw new HttpError(409, "SHIRT_FULL", "This shirt has no signing capacity remaining.");
        }
        const paymentReference = `SMO-${Date.now()}-${randomUUID()}`;
        const payment = await tx.payment.create({
          data: {
            ownerId: shirt.ownerId,
            shirtId: shirt.id,
            contributorEmail,
            reference: paymentReference,
            provider: "PAYSTACK",
            currency: "NGN",
            giftAmountKobo,
            signatureSize: requestedSize,
            enlargementFeeKobo: totals.enlargementFeeKobo,
            grossAmountKobo,
            ownerAmountKobo,
            platformAmountKobo,
            ownerBasisPoints: totals.ownerBasisPoints,
            platformBasisPoints: totals.platformBasisPoints,
            commissionPolicyVersion: totals.commissionPolicyVersion,
            status: "PENDING",
            expiresAt: new Date(Date.now() + PAYMENT_LIFETIME_MS),
            nextReconciliationAt: new Date(Date.now() + 5 * 60_000),
          },
        });
        return { shirt, payment };
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2034") {
      throw new HttpError(409, "CHECKOUT_RETRY_REQUIRED", "Signing availability changed. Please retry checkout.");
    }
    throw error;
  }
  const { shirt, payment } = checkout;

  try {
    const initialization = await initializeTransaction({
      email: contributorEmail,
      amount: grossAmountKobo,
      reference: payment.reference,
      callbackUrl: `${env.frontendUrl}/payment/callback`,
      metadata: {
        shirtSlug: shirt.slug,
        shirtId: shirt.id,
        ownerId: shirt.ownerId,
        signatureSize: requestedSize,
      },
    });

    return {
      payment: {
        id: payment.id,
        reference: payment.reference,
        status: payment.status,
        giftAmountKobo: payment.giftAmountKobo,
        signatureSize: payment.signatureSize,
        enlargementFeeKobo: payment.enlargementFeeKobo,
        grossAmountKobo: payment.grossAmountKobo,
        ownerAmountKobo: payment.ownerAmountKobo,
        platformAmountKobo: payment.platformAmountKobo,
        ownerBasisPoints: payment.ownerBasisPoints,
        platformBasisPoints: payment.platformBasisPoints,
        commissionPolicyVersion: payment.commissionPolicyVersion,
      },
      authorizationUrl: initialization.authorization_url,
    };
  } catch (error) {
    const definitiveRejection =
      error instanceof PaystackError && [400, 422].includes(error.status);

    if (definitiveRejection) {
      await prisma.payment.updateMany({
        where: { id: payment.id, status: "PENDING" },
        data: { status: "FAILED", nextReconciliationAt: null },
      });
    }

    if (error instanceof PaystackError) {
      throw new HttpError(
        502,
        "PAYMENT_INITIALIZATION_FAILED",
        "Payment could not be initialized. Check the payment status before trying again.",
        { reference: payment.reference, status: definitiveRejection ? "FAILED" : "PENDING" },
      );
    }

    throw error;
  }
}

export async function initiateFullPaymentRefund(
  adminUserId: string,
  paymentId: string,
  reason: string,
) {
  const payment = await prisma.$transaction(
    async (tx) => {
      const current = await tx.payment.findUnique({
        where: { id: paymentId },
        include: {
          entitlements: { select: { status: true } },
          _count: { select: { signatures: true } },
        },
      });
      if (!current) {
        throw new HttpError(404, "PAYMENT_NOT_FOUND", "Payment not found.");
      }
      if (["PENDING", "PROCESSING"].includes(current.refundStatus)) return current;
      if (current.status !== "PAID" || current.refundStatus !== "NOT_REQUESTED") {
        throw new HttpError(409, "PAYMENT_NOT_REFUNDABLE", "This payment is not eligible for a new refund.");
      }
      if (
        current._count.signatures > 0 ||
        current.entitlements.some(({ status }) => status !== "AVAILABLE")
      ) {
        throw new HttpError(
          409,
          "SIGNATURE_ALREADY_FULFILLED",
          "A payment cannot be refunded after its signing entitlement has been used.",
        );
      }

      const ledger = await tx.ledgerEntry.groupBy({
        by: ["entryType"],
        where: { ownerId: current.ownerId },
        _sum: { amountKobo: true },
      });
      const sumFor = (entryType: string) =>
        ledger.find((entry) => entry.entryType === entryType)?._sum.amountKobo ?? 0;
      const balance = calculateWithdrawalBalance({
        ownerCreditsKobo:
          sumFor("OWNER_CREDIT") +
          sumFor("REFUND_ADJUSTMENT") +
          sumFor("CHARGEBACK_ADJUSTMENT"),
        withdrawalHoldsKobo: sumFor("WITHDRAWAL_HOLD"),
        withdrawalReleasesKobo: sumFor("WITHDRAWAL_RELEASE"),
        withdrawalCompletedKobo: sumFor("WITHDRAWAL_COMPLETED"),
        withdrawalReversalsKobo: sumFor("WITHDRAWAL_REVERSAL"),
      });
      if (balance.availableBalance < current.ownerAmountKobo) {
        throw new HttpError(
          409,
          "REFUND_BALANCE_UNAVAILABLE",
          "The owner's allocated funds are no longer available for this refund.",
        );
      }

      const refundReference = `SMO-RF-${current.id}`;
      const claimed = await tx.payment.updateMany({
        where: { id: paymentId, status: "PAID", refundStatus: "NOT_REQUESTED" },
        data: { refundStatus: "PENDING", refundReference, refundReason: reason },
      });
      if (claimed.count !== 1) {
        throw new HttpError(409, "REFUND_CHANGED", "The refund state changed. Refresh and try again.");
      }
      await tx.paymentEvent.create({
        data: {
          paymentId,
          eventType: "refund.requested",
          rawPayload: { refundReference, reason },
        },
      });
      await tx.adminAuditLog.create({
        data: {
          adminUserId,
          action: "payment.refund_requested",
          resourceType: "payment",
          resourceId: paymentId,
          details: { refundReference, reason },
        },
      });
      return { ...current, refundReference };
    },
    { isolationLevel: "Serializable" },
  );

  if (["PENDING", "PROCESSING"].includes(payment.refundStatus)) {
    return {
      paymentId: payment.id,
      refundReference: payment.refundReference,
      status: payment.refundStatus,
    };
  }

  if (!payment.refundReference) {
    throw new HttpError(500, "REFUND_REFERENCE_MISSING", "Refund reference was not recorded.");
  }

  try {
    const refund = await createRefund({
      transaction: payment.reference,
      amount: payment.grossAmountKobo,
      reference: payment.refundReference,
      reason,
    });
    await prisma.payment.updateMany({
      where: { id: payment.id, refundStatus: "PENDING" },
      data: { refundStatus: refund.status === "processing" ? "PROCESSING" : "PENDING" },
    });
    return {
      paymentId: payment.id,
      refundReference: payment.refundReference,
      status: refund.status,
    };
  } catch (error) {
    if (error instanceof PaystackError && [400, 404, 422].includes(error.status)) {
      await prisma.payment.updateMany({
        where: { id: payment.id, refundStatus: { in: ["PENDING", "PROCESSING"] } },
        data: { refundStatus: "FAILED" },
      });
      throw new HttpError(502, "REFUND_REJECTED", "Paystack rejected the refund request.");
    }
    logger.error({ error, paymentId }, "Refund result is unknown; awaiting webhook reconciliation");
    return {
      paymentId: payment.id,
      refundReference: payment.refundReference,
      status: "PENDING",
    };
  }
}

export async function processDuePaymentReconciliations() {
  const now = new Date();
  const due = await prisma.payment.findMany({
    where: {
      status: "PENDING",
      nextReconciliationAt: { lte: now },
    },
    orderBy: { nextReconciliationAt: "asc" },
    take: 20,
    select: {
      id: true,
      reference: true,
      expiresAt: true,
      reconciliationAttempts: true,
    },
  });

  for (const payment of due) {
    const claimed = await prisma.payment.updateMany({
      where: {
        id: payment.id,
        status: "PENDING",
        nextReconciliationAt: { lte: now },
      },
      data: { nextReconciliationAt: new Date(Date.now() + 5 * 60_000) },
    });
    if (claimed.count !== 1) continue;

    try {
      const result = await getPaymentStatus(payment.reference);
      if (result.status !== "PENDING") continue;

      const attempts = payment.reconciliationAttempts + 1;
      const maximumDelay = payment.expiresAt <= new Date() ? 6 * 60 * 60_000 : 60 * 60_000;
      const delayMs = Math.min(5 * 60_000 * 2 ** Math.min(attempts, 7), maximumDelay);
      await prisma.payment.updateMany({
        where: { id: payment.id, status: "PENDING" },
        data: {
          reconciliationAttempts: { increment: 1 },
          nextReconciliationAt: new Date(Date.now() + delayMs),
        },
      });
    } catch (error) {
      const attempts = payment.reconciliationAttempts + 1;
      const delayMs = Math.min(5 * 60_000 * 2 ** Math.min(attempts, 5), 60 * 60_000);
      await prisma.payment.updateMany({
        where: { id: payment.id, status: "PENDING" },
        data: {
          reconciliationAttempts: { increment: 1 },
          nextReconciliationAt: new Date(Date.now() + delayMs),
        },
      });
      logger.error({ error, paymentId: payment.id }, "Payment reconciliation attempt failed");
    }
  }
}

function signaturesMatch(expected: Buffer, receivedHex: string) {
  if (!/^[0-9a-f]{128}$/i.test(receivedHex)) return false;
  const received = Buffer.from(receivedHex, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function verifyPaystackWebhookSignature(
  rawBody: string,
  legacySignature: string | undefined,
  timestampedSignature: string | undefined,
) {
  if (timestampedSignature) {
    const fields = timestampedSignature.split(",");
    const timestamp = fields.find((field) => field.startsWith("t="))?.slice(2);
    const signatures = fields
      .filter((field) => field.startsWith("v1="))
      .map((field) => field.slice(3).split(":", 2)[1])
      .filter((value): value is string => Boolean(value));
    const timestampSeconds = Number(timestamp);
    if (
      !env.paystackWebhookSecret ||
      !Number.isInteger(timestampSeconds) ||
      Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > 300
    ) {
      return false;
    }
    const expected = createHmac("sha512", env.paystackWebhookSecret)
      .update(`${timestamp}.${rawBody}`)
      .digest();
    return signatures.some((signature) => signaturesMatch(expected, signature));
  }

  if (!legacySignature || !env.paystackSecretKey) return false;
  const expected = createHmac("sha512", env.paystackSecretKey).update(rawBody).digest();
  return signaturesMatch(expected, legacySignature);
}

async function processRefundWebhook(
  eventType: string,
  data: Record<string, unknown>,
  rawPayload: Prisma.InputJsonValue,
) {
  const parsed = z.object({
    transaction_reference: z.string().min(1),
    refund_reference: z.string().nullable().optional(),
    amount: z.union([z.number(), z.string().regex(/^\d+$/).transform(Number)]),
    currency: z.string(),
  }).passthrough().parse(data);

  const payment = await prisma.payment.findUnique({
    where: { reference: parsed.transaction_reference },
  });
  if (!payment) {
    throw new HttpError(404, "PAYMENT_NOT_FOUND", "Payment reference was not found.");
  }
  if (parsed.amount !== payment.grossAmountKobo || parsed.currency !== "NGN") {
    throw new HttpError(400, "REFUND_AMOUNT_MISMATCH", "Refund details do not match the original payment.");
  }
  if (
    payment.refundReference &&
    parsed.refund_reference &&
    payment.refundReference !== parsed.refund_reference
  ) {
    throw new HttpError(400, "REFUND_REFERENCE_MISMATCH", "Refund reference does not match the requested refund.");
  }

  const refundStatus = eventType === "refund.processed"
    ? "PROCESSED"
    : eventType === "refund.failed"
      ? "FAILED"
      : eventType === "refund.processing"
        ? "PROCESSING"
        : "PENDING";

  return prisma.$transaction(async (tx) => {
    await tx.paymentEvent.create({
      data: { paymentId: payment.id, eventType, rawPayload },
    });

    if (refundStatus === "PROCESSED") {
      const transitioned = await tx.payment.updateMany({
        where: { id: payment.id, status: "PAID", refundStatus: { not: "PROCESSED" } },
        data: {
          status: "REFUNDED",
          refundStatus: "PROCESSED",
          refundReference: parsed.refund_reference ?? payment.refundReference,
        },
      });
      if (transitioned.count === 1) {
        await tx.signingEntitlement.updateMany({
          where: { paymentId: payment.id, status: "AVAILABLE" },
          data: { status: "CANCELLED" },
        });
        await tx.ledgerEntry.createMany({
          data: [
            {
              ownerId: payment.ownerId,
              paymentId: payment.id,
              entryType: "REFUND_ADJUSTMENT",
              amountKobo: -payment.ownerAmountKobo,
              description: "Owner allocation reversed after processed refund",
              sourceReference: parsed.refund_reference ?? payment.reference,
              idempotencyKey: `${payment.reference}:refund-owner`,
            },
            {
              ownerId: null,
              paymentId: payment.id,
              entryType: "REFUND_ADJUSTMENT",
              amountKobo: -payment.platformAmountKobo,
              description: "Platform allocation reversed after processed refund",
              sourceReference: parsed.refund_reference ?? payment.reference,
              idempotencyKey: `${payment.reference}:refund-platform`,
            },
          ],
          skipDuplicates: true,
        });
        if (payment.shirtId) {
          await reconcileShirtCapacity(tx, payment.shirtId);
        }
        await enqueueEmail(tx, {
          eventType: "refund.processed",
          recipient: payment.contributorEmail,
          subject: "Your SignMeOut refund was processed",
          body: `Your refund of NGN ${(payment.grossAmountKobo / 100).toFixed(2)} has been processed. Reference: ${parsed.refund_reference ?? payment.reference}.`,
          idempotencyKey: `${payment.reference}:refund-processed-email`,
        });
      }
    } else {
      await tx.payment.updateMany({
        where: { id: payment.id, status: "PAID", refundStatus: { not: "PROCESSED" } },
        data: {
          refundStatus,
          refundReference: parsed.refund_reference ?? payment.refundReference,
        },
      });
    }

    return {
      received: true,
      reference: payment.reference,
      status: refundStatus,
    };
  });
}

async function processDisputeWebhook(
  eventType: string,
  data: Record<string, unknown>,
  rawPayload: Prisma.InputJsonValue,
) {
  const transaction =
    typeof data.transaction === "object" && data.transaction !== null
      ? data.transaction as Record<string, unknown>
      : undefined;
  const reference =
    typeof data.transaction_reference === "string"
      ? data.transaction_reference
      : typeof transaction?.reference === "string"
        ? transaction.reference
        : typeof data.reference === "string"
          ? data.reference
          : undefined;
  if (!reference) {
    throw new HttpError(400, "INVALID_DISPUTE_PAYLOAD", "Dispute event has no transaction reference.");
  }
  const payment = await prisma.payment.findUnique({ where: { reference } });
  if (!payment) throw new HttpError(404, "PAYMENT_NOT_FOUND", "Payment reference was not found.");

  const disputeStatus = eventType === "charge.dispute.resolve"
    ? "RESOLVED"
    : eventType === "charge.dispute.remind"
      ? "OPEN_REMINDER"
      : "OPEN";
  const disputeId = data.id === undefined ? payment.disputeId : String(data.id);
  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: { disputeStatus, disputeId },
    });
    await tx.paymentEvent.create({
      data: { paymentId: payment.id, eventType, rawPayload },
    });
  });
  return { received: true, reference, status: disputeStatus };
}

export async function processPaystackWebhook(
  rawBody: string,
  legacySignature: string | undefined,
  timestampedSignature?: string,
) {
  if (!legacySignature && !timestampedSignature) {
    throw new HttpError(401, "INVALID_WEBHOOK_SIGNATURE", "Missing webhook signature.");
  }
  if (!verifyPaystackWebhookSignature(rawBody, legacySignature, timestampedSignature)) {
    throw new HttpError(401, "INVALID_WEBHOOK_SIGNATURE", "Webhook signature verification failed.");
  }

  let payload: { event: string; data: Record<string, unknown> };
  try {
    payload = z.object({
      event: z.string().min(1),
      data: z.record(z.string(), z.unknown()),
    }).passthrough().parse(JSON.parse(rawBody));
  } catch {
    throw new HttpError(400, "INVALID_WEBHOOK_PAYLOAD", "Invalid Paystack webhook payload.");
  }

  const paymentEvent = payload.event;
  const tx = payload.data;
  const rawPayload = JSON.parse(rawBody) as Prisma.InputJsonValue;

  if (paymentEvent.startsWith("refund.")) {
    return processRefundWebhook(paymentEvent, tx, rawPayload);
  }
  if (paymentEvent.startsWith("charge.dispute.")) {
    return processDisputeWebhook(paymentEvent, tx, rawPayload);
  }

  const transaction = z.object({
    reference: z.string().min(1),
    status: z.string().optional(),
    amount: z.number().int().nonnegative().optional(),
    currency: z.string().optional(),
    id: z.union([z.number(), z.string()]).optional(),
    fees: z.number().int().nonnegative().optional(),
  }).passthrough().safeParse(tx);
  if (!transaction.success) {
    throw new HttpError(400, "INVALID_WEBHOOK_PAYLOAD", "Invalid Paystack transaction payload.");
  }
  const transactionData = transaction.data;
  const reference = transactionData.reference;

  if (paymentEvent.startsWith("transfer.")) {
    const withdrawal = await processPaystackTransferWebhook({
      eventType: paymentEvent,
      reference,
      amount: transactionData.amount,
      currency: transactionData.currency,
      rawPayload,
    });
    return {
      received: true,
      status: withdrawal.status,
      reference,
    };
  }

  const payment = await prisma.payment.findUnique({ where: { reference } });
  if (!payment) {
    throw new HttpError(404, "PAYMENT_NOT_FOUND", "Payment reference was not found.");
  }

  if (paymentEvent !== "charge.success" && paymentEvent !== "transaction.success") {
    if (paymentEvent !== "charge.failed") {
      return { received: true, status: payment.status, reference };
    }

    const status = await prisma.$transaction(async (txClient) => {
      await txClient.paymentEvent.create({
        data: {
          paymentId: payment.id,
          eventType: paymentEvent,
          rawPayload,
        },
      });
      const transitioned = await txClient.payment.updateMany({
        where: { id: payment.id, status: "PENDING" },
        data: { status: "FAILED", nextReconciliationAt: null },
      });
      if (transitioned.count > 0) return "FAILED";

      const current = await txClient.payment.findUnique({
        where: { id: payment.id },
        select: { status: true },
      });
      return current?.status ?? payment.status;
    });

    return { received: true, status, reference };
  }

  const result = await recordSuccessfulPayment(
    payment,
    transactionData,
    paymentEvent,
    rawPayload,
  );
  return { received: true, status: result, reference };
}
