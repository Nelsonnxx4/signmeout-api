import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, txMock, verifyTransactionMock } = vi.hoisted(() => {
  const tx = {
    payment: {
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },
    paymentEvent: { create: vi.fn() },
    signingEntitlement: { create: vi.fn() },
    ledgerEntry: { createMany: vi.fn() },
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
  env: { paystackSecretKey: "test-paystack-secret" },
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
  shirtId: "shirt-1",
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
    txMock.ledgerEntry.createMany.mockResolvedValue({ count: 2 });
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
});
