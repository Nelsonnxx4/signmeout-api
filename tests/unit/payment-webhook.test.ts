import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, txMock, verifyTransactionMock } = vi.hoisted(() => {
  const tx = {
    payment: {
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },
    paymentEvent: { create: vi.fn() },
    signingEntitlement: { create: vi.fn(), updateMany: vi.fn() },
    ledgerEntry: { createMany: vi.fn() },
    user: { findUnique: vi.fn() },
    emailOutbox: { upsert: vi.fn() },
    shirt: { findUnique: vi.fn(), updateMany: vi.fn() },
  };

  return {
    txMock: tx,
    verifyTransactionMock: vi.fn(),
    prismaMock: {
      payment: { findUnique: vi.fn() },
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    },
  };
});

vi.mock("../../src/config/database.js", () => ({ prisma: prismaMock }));
vi.mock("../../src/config/logger.js", () => ({
  logger: { error: vi.fn() },
}));
vi.mock("../../src/config/env.js", () => ({
  env: {
    paystackSecretKey: "test-paystack-secret",
    paystackWebhookSecret: "test-webhook-secret",
  },
}));
vi.mock("../../src/lib/signing-access.js", () => ({
  createSigningAccessToken: vi.fn(() => "signing-token"),
}));
vi.mock("../../src/integrations/paystack/paystack.client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/integrations/paystack/paystack.client.js")>();
  return { ...actual, verifyTransaction: verifyTransactionMock };
});

import {
  getPaymentStatus,
  processPaystackWebhook,
} from "../../src/modules/payments/payment.service.js";

const payment = {
  id: "payment-1",
  ownerId: "owner-1",
  reference: "SMO-test-reference",
  status: "PENDING",
  grossAmountKobo: 600_000,
  ownerAmountKobo: 510_000,
  platformAmountKobo: 90_000,
  processingFeeKobo: 0,
  shirtId: "shirt-1",
  contributorEmail: "contributor@example.com",
};

function signedPayload(payload: unknown) {
  const rawBody = JSON.stringify(payload);
  const signature = createHmac("sha512", "test-paystack-secret")
    .update(rawBody)
    .digest("hex");
  return { rawBody, signature };
}

describe("processPaystackWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(
      async (callback: (client: typeof txMock) => Promise<unknown>) => callback(txMock),
    );
    prismaMock.payment.findUnique.mockResolvedValue(payment);
    txMock.payment.updateMany.mockResolvedValue({ count: 1 });
    txMock.payment.findUnique.mockResolvedValue({ status: "PAID" });
    txMock.paymentEvent.create.mockResolvedValue({});
    txMock.signingEntitlement.create.mockResolvedValue({});
    txMock.signingEntitlement.updateMany.mockResolvedValue({ count: 1 });
    txMock.ledgerEntry.createMany.mockResolvedValue({ count: 2 });
    txMock.user.findUnique.mockResolvedValue(null);
    txMock.emailOutbox.upsert.mockResolvedValue({});
    txMock.shirt.findUnique.mockResolvedValue(null);
    txMock.shirt.updateMany.mockResolvedValue({ count: 0 });
    verifyTransactionMock.mockResolvedValue({
      reference: payment.reference,
      status: "success",
      amount: payment.grossAmountKobo,
      currency: "NGN",
      id: 12345,
    });
  });

  it("allocates a successful payment once and creates one signing entitlement", async () => {
    const { rawBody, signature } = signedPayload({
      event: "charge.success",
      data: {
        reference: payment.reference,
        status: "success",
        amount: payment.grossAmountKobo,
        currency: "NGN",
        id: 12345,
        fees: 9_000,
      },
    });

    await expect(processPaystackWebhook(rawBody, signature)).resolves.toEqual({
      received: true,
      status: "PAID",
      reference: payment.reference,
    });

    expect(txMock.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: payment.id, status: "PENDING" },
      }),
    );
    expect(txMock.signingEntitlement.create).toHaveBeenCalledTimes(1);
    expect(txMock.ledgerEntry.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ idempotencyKey: `${payment.reference}:owner-credit` }),
        expect.objectContaining({ idempotencyKey: `${payment.reference}:platform-revenue` }),
        expect.objectContaining({
          idempotencyKey: `${payment.reference}:gateway-fee`,
          amountKobo: -9_000,
        }),
      ]),
    });
  });

  it("does not create allocations when another webhook already changed payment status", async () => {
    txMock.payment.updateMany.mockResolvedValue({ count: 0 });
    const { rawBody, signature } = signedPayload({
      event: "charge.success",
      data: {
        reference: payment.reference,
        status: "success",
        amount: payment.grossAmountKobo,
        currency: "NGN",
      },
    });

    await processPaystackWebhook(rawBody, signature);

    expect(txMock.signingEntitlement.create).not.toHaveBeenCalled();
    expect(txMock.ledgerEntry.createMany).not.toHaveBeenCalled();
  });

  it("does not treat unrelated Paystack events as failed payments", async () => {
    const { rawBody, signature } = signedPayload({
      event: "charge.refund",
      data: { reference: payment.reference },
    });

    await expect(processPaystackWebhook(rawBody, signature)).resolves.toEqual({
      received: true,
      status: "PENDING",
      reference: payment.reference,
    });

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a successful event with a mismatched amount", async () => {
    const { rawBody, signature } = signedPayload({
      event: "charge.success",
      data: {
        reference: payment.reference,
        status: "success",
        amount: payment.grossAmountKobo + 1,
        currency: "NGN",
      },
    });

    await expect(processPaystackWebhook(rawBody, signature)).rejects.toMatchObject({
      code: "PAYMENT_AMOUNT_MISMATCH",
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("reconciles delayed webhooks and returns a signing capability after provider verification", async () => {
    prismaMock.payment.findUnique
      .mockResolvedValueOnce(payment)
      .mockResolvedValueOnce({
        ...payment,
        status: "PAID",
        entitlements: [{ id: "entitlement-1", status: "AVAILABLE" }],
      });

    const status = await getPaymentStatus(payment.reference);

    expect(verifyTransactionMock).toHaveBeenCalledWith(payment.reference);
    expect(status.status).toBe("PAID");
    expect(status.signing).toEqual({
      entitlementId: "entitlement-1",
      status: "AVAILABLE",
      accessToken: "signing-token",
    });
    expect(txMock.signingEntitlement.create).toHaveBeenCalledTimes(1);
    expect(txMock.ledgerEntry.createMany).toHaveBeenCalledTimes(1);
  });

  it("cancels reconciliation only after Paystack reports an abandoned transaction", async () => {
    verifyTransactionMock.mockResolvedValue({
      reference: payment.reference,
      status: "abandoned",
      amount: payment.grossAmountKobo,
      currency: "NGN",
    });
    prismaMock.payment.findUnique
      .mockResolvedValueOnce(payment)
      .mockResolvedValueOnce({ ...payment, status: "CANCELLED", entitlements: [] });

    await expect(getPaymentStatus(payment.reference)).resolves.toMatchObject({
      status: "CANCELLED",
      signing: null,
    });
    expect(txMock.payment.updateMany).toHaveBeenCalledWith({
      where: { id: payment.id, status: "PENDING" },
      data: { status: "CANCELLED", nextReconciliationAt: null },
    });
  });

  it("accepts the timestamped Paystack webhook signature", async () => {
    txMock.payment.updateMany.mockResolvedValue({ count: 0 });
    const rawBody = JSON.stringify({
      event: "charge.success",
      data: {
        reference: payment.reference,
        status: "success",
        amount: payment.grossAmountKobo,
        currency: "NGN",
      },
    });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha512", "test-webhook-secret")
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");

    await expect(
      processPaystackWebhook(rawBody, undefined, `t=${timestamp},v1=whk_test:${signature}`),
    ).resolves.toMatchObject({ received: true, reference: payment.reference });
  });

  it("reverses allocations only after a processed refund webhook", async () => {
    prismaMock.payment.findUnique.mockResolvedValue({
      ...payment,
      status: "PAID",
      refundStatus: "PENDING",
      refundReference: "SMO-RF-payment-1",
    });
    const { rawBody, signature } = signedPayload({
      event: "refund.processed",
      data: {
        status: "processed",
        transaction_reference: payment.reference,
        refund_reference: "SMO-RF-payment-1",
        amount: String(payment.grossAmountKobo),
        currency: "NGN",
      },
    });

    await expect(processPaystackWebhook(rawBody, signature)).resolves.toEqual({
      received: true,
      reference: payment.reference,
      status: "PROCESSED",
    });
    expect(txMock.signingEntitlement.updateMany).toHaveBeenCalledWith({
      where: { paymentId: payment.id, status: "AVAILABLE" },
      data: { status: "CANCELLED" },
    });
    expect(txMock.ledgerEntry.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          entryType: "REFUND_ADJUSTMENT",
          amountKobo: -payment.ownerAmountKobo,
        }),
      ]),
      skipDuplicates: true,
    });
  });
});
