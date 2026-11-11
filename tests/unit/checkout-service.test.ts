import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, txMock, initializeTransactionMock } = vi.hoisted(() => {
  const tx = {
    shirt: { findUnique: vi.fn() },
    payment: { count: vi.fn(), create: vi.fn() },
  };
  return {
    txMock: tx,
    initializeTransactionMock: vi.fn(),
    prismaMock: {
      payment: { updateMany: vi.fn() },
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    },
  };
});

vi.mock("../../src/config/database.js", () => ({ prisma: prismaMock }));
vi.mock("../../src/config/logger.js", () => ({ logger: { error: vi.fn() } }));
vi.mock("../../src/config/env.js", () => ({
  env: {
    frontendUrl: "http://localhost:5173",
    paystackSecretKey: "test-key",
  },
}));
vi.mock("../../src/integrations/paystack/paystack.client.js", () => ({
  initializeTransaction: initializeTransactionMock,
  verifyTransaction: vi.fn(),
  createRefund: vi.fn(),
  PaystackError: class PaystackError extends Error {
    constructor(message: string, public readonly status: number) {
      super(message);
    }
  },
}));

import { createCheckout } from "../../src/modules/payments/payment.service.js";

const placementConfig = {
  version: 1,
  maxSignatures: 2,
  surfaces: [{
    id: "front",
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    restrictedRegions: [],
    maxSignatureWidth: 0.25,
    maxSignatureHeight: 0.25,
  }],
};

const shirt = {
  id: "shirt-1",
  ownerId: "owner-1",
  status: "ACTIVE",
  slug: "ada-shirt",
  shirtType: "SHORT_SLEEVE",
  modelVersion: { placementConfig },
};

describe("createCheckout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(
      async (callback: (client: typeof txMock) => Promise<unknown>) => callback(txMock),
    );
    txMock.shirt.findUnique.mockResolvedValue(shirt);
    txMock.payment.count.mockResolvedValue(0);
    txMock.payment.create.mockImplementation(async ({ data }) => ({ id: "payment-1", ...data }));
    initializeTransactionMock.mockResolvedValue({
      authorization_url: "https://checkout.paystack.test/authorization",
      reference: "provider-reference",
    });
  });

  it("uses the contributor's email and reserves a configured signing slot", async () => {
    const result = await createCheckout({
      shirtSlug: shirt.slug,
      contributorEmail: "friend@example.com",
      giftAmountKobo: 200_000,
      signatureSize: 1,
    });

    expect(initializeTransactionMock).toHaveBeenCalledWith(
      expect.objectContaining({ email: "friend@example.com" }),
    );
    expect(result.authorizationUrl).toContain("paystack.test");
  });

  it("rejects checkout until placement is configured", async () => {
    txMock.shirt.findUnique.mockResolvedValue({
      ...shirt,
      modelVersion: { placementConfig: null },
    });

    await expect(createCheckout({
      shirtSlug: shirt.slug,
      contributorEmail: "friend@example.com",
      giftAmountKobo: 200_000,
    })).rejects.toMatchObject({ code: "SIGNING_NOT_CONFIGURED" });
    expect(initializeTransactionMock).not.toHaveBeenCalled();
  });

  it("rejects checkout when all configured slots are reserved", async () => {
    txMock.payment.count.mockResolvedValue(2);

    await expect(createCheckout({
      shirtSlug: shirt.slug,
      contributorEmail: "friend@example.com",
      giftAmountKobo: 200_000,
    })).rejects.toMatchObject({ code: "SHIRT_FULL" });
    expect(txMock.payment.create).not.toHaveBeenCalled();
  });
});
