import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Payment as PaymentRecord, Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "../../config/database.js";
import { env } from "../../config/env.js";
import { HttpError } from "../../lib/http-error.js";
import { createSigningAccessToken } from "../../lib/signing-access.js";
import {
  initializeTransaction,
  PaystackError,
  verifyTransaction,
} from "../../integrations/paystack/paystack.client.js";
import { isSigningAvailable } from "../shirts/shirt.rules.js";
import { processPaystackTransferWebhook } from "../withdrawals/withdrawal.service.js";
import { calculateCheckoutTotals, getValidSignatureSizes } from "./payment.rules.js";

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
        paidAt: new Date(),
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
    await txClient.ledgerEntry.createMany({
      data: [
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
      ],
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
    } else if (providerData.status === "failed") {
      await prisma.$transaction(async (tx) => {
        await tx.paymentEvent.create({
          data: {
            paymentId: pendingPayment.id,
            eventType: "transaction.reconciled_failed",
            rawPayload: providerData as unknown as Prisma.InputJsonValue,
          },
        });
        await tx.payment.updateMany({
          where: { id: pendingPayment.id, status: "PENDING" },
          data: { status: "FAILED" },
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
  giftAmountKobo,
  signatureSize,
}: {
  shirtSlug: string;
  giftAmountKobo: number;
  signatureSize?: number;
}) {
  const shirt = await prisma.shirt.findUnique({
    where: { slug: shirtSlug },
    select: {
      id: true,
      ownerId: true,
      status: true,
      slug: true,
      shirtType: true,
    },
  });

  if (!shirt || shirt.status === "ARCHIVED") {
    throw new HttpError(404, "SHIRT_NOT_FOUND", "Shirt not found.");
  }

  if (!isSigningAvailable(shirt.status)) {
    throw new HttpError(409, "SHIRT_UNAVAILABLE", "This shirt is not accepting signatures right now.");
  }

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

  const paymentReference = `SMO-${Date.now()}-${randomUUID()}`;

  const payment = await prisma.payment.create({
    data: {
      ownerId: shirt.ownerId,
      shirtId: shirt.id,
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
    },
  });

  try {
    const initialization = await initializeTransaction({
      email: "guest@signmeout.app",
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
        data: { status: "FAILED" },
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

export async function processPaystackWebhook(rawBody: string, signature: string | undefined) {
  if (!signature) {
    throw new HttpError(401, "INVALID_WEBHOOK_SIGNATURE", "Missing webhook signature.");
  }

  const secret = env.paystackSecretKey;
  if (!secret) {
    throw new HttpError(500, "PAYSTACK_NOT_CONFIGURED", "Paystack is not configured.");
  }

  const expectedSignature = createHmac("sha512", secret)
    .update(rawBody)
    .digest("hex");

  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    receivedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(receivedBuffer, expectedBuffer)
  ) {
    throw new HttpError(401, "INVALID_WEBHOOK_SIGNATURE", "Webhook signature verification failed.");
  }

  let payload: {
    event: string;
    data: {
      reference: string;
      status?: string;
      amount?: number;
      currency?: string;
      id?: number | string;
    };
  };
  try {
    payload = z.object({
      event: z.string().min(1),
      data: z.object({
        reference: z.string().min(1),
        status: z.string().optional(),
        amount: z.number().int().nonnegative().optional(),
        currency: z.string().optional(),
        id: z.union([z.number(), z.string()]).optional(),
      }).passthrough(),
    }).passthrough().parse(JSON.parse(rawBody));
  } catch {
    throw new HttpError(400, "INVALID_WEBHOOK_PAYLOAD", "Invalid Paystack webhook payload.");
  }

  const paymentEvent = payload.event;
  const tx = payload.data;
  const reference = tx.reference;

  if (paymentEvent.startsWith("transfer.")) {
    const withdrawal = await processPaystackTransferWebhook({
      eventType: paymentEvent,
      reference,
      amount: tx.amount,
      currency: tx.currency,
      rawPayload: JSON.parse(rawBody),
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
          rawPayload: JSON.parse(rawBody),
        },
      });
      const transitioned = await txClient.payment.updateMany({
        where: { id: payment.id, status: "PENDING" },
        data: { status: "FAILED" },
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
    tx,
    paymentEvent,
    JSON.parse(rawBody),
  );
  return { received: true, status: result, reference };
}
