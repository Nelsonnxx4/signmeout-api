import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, txMock, storageMock, tokenMock } = vi.hoisted(() => {
  const tx = {
    signature: { findMany: vi.fn(), create: vi.fn() },
    signingEntitlement: { updateMany: vi.fn() },
  };
  return {
    txMock: tx,
    prismaMock: {
      signingEntitlement: { findUnique: vi.fn() },
      signature: { findFirst: vi.fn() },
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    },
    storageMock: {
      createSignatureReadUrl: vi.fn(),
      createSignatureUploadUrl: vi.fn(),
      deleteSignatureAsset: vi.fn(),
      validateAndStoreSignatureAsset: vi.fn(),
    },
    tokenMock: { verifySigningAccessToken: vi.fn() },
  };
});

vi.mock("../../src/config/database.js", () => ({ prisma: prismaMock }));
vi.mock("../../src/integrations/storage/r2.client.js", () => storageMock);
vi.mock("../../src/lib/signing-access.js", () => tokenMock);

import { createSignature } from "../../src/modules/signatures/signature.service.js";

const config = {
  version: 1,
  surfaces: [{
    id: "front",
    bounds: { minX: 0.1, minY: 0.1, maxX: 0.9, maxY: 0.9 },
    restrictedRegions: [],
    maxSignatureWidth: 0.4,
    maxSignatureHeight: 0.4,
  }],
};

const entitlement = {
  id: "entitlement-1",
  paymentId: "payment-1",
  shirtId: "shirt-1",
  status: "AVAILABLE",
  payment: { status: "PAID", signatureSize: 2 },
  shirt: {
    id: "shirt-1",
    status: "ACTIVE",
    modelVersion: { placementConfig: config },
  },
};

const input = {
  accessToken: "valid-token",
  assetKey: "signature-uploads/entitlement-1/00000000-0000-4000-8000-000000000001.png",
  surfaceId: "front",
  uvX: 0.3,
  uvY: 0.3,
  width: 0.1,
  height: 0.1,
  rotation: 0,
  scale: 2,
};

describe("createSignature", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tokenMock.verifySigningAccessToken.mockReturnValue("entitlement-1");
    prismaMock.signingEntitlement.findUnique.mockResolvedValue(entitlement);
    prismaMock.$transaction.mockImplementation(
      async (callback: (client: typeof txMock) => Promise<unknown>) => callback(txMock),
    );
    txMock.signature.findMany.mockResolvedValue([]);
    txMock.signingEntitlement.updateMany.mockResolvedValue({ count: 1 });
    txMock.signature.create.mockResolvedValue({ id: "signature-1", ...input });
    storageMock.validateAndStoreSignatureAsset.mockResolvedValue(
      "signatures/entitlement-1/00000000-0000-4000-8000-000000000002.webp",
    );
    storageMock.deleteSignatureAsset.mockResolvedValue(undefined);
  });

  it("uses a paid capability, validates the upload, and atomically consumes its entitlement", async () => {
    await createSignature(input);

    expect(storageMock.validateAndStoreSignatureAsset).toHaveBeenCalledWith(
      input.assetKey,
      "entitlement-1",
    );
    expect(txMock.signingEntitlement.updateMany).toHaveBeenCalledWith({
      where: { id: "entitlement-1", status: "AVAILABLE" },
      data: expect.objectContaining({ status: "USED" }),
    });
    expect(txMock.signature.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assetKey: "signatures/entitlement-1/00000000-0000-4000-8000-000000000002.webp",
        entitlementId: "entitlement-1",
      }),
      select: expect.any(Object),
    });
  });

  it("does not accept an unconfigured model", async () => {
    prismaMock.signingEntitlement.findUnique.mockResolvedValue({
      ...entitlement,
      shirt: { ...entitlement.shirt, modelVersion: { placementConfig: null } },
    });

    await expect(createSignature(input)).rejects.toMatchObject({
      code: "PLACEMENT_CONFIGURATION_UNAVAILABLE",
      status: 503,
    });
    expect(storageMock.validateAndStoreSignatureAsset).not.toHaveBeenCalled();
  });

  it("does not consume an entitlement if another request already used it", async () => {
    txMock.signingEntitlement.updateMany.mockResolvedValue({ count: 0 });

    await expect(createSignature(input)).rejects.toMatchObject({
      code: "SIGNING_ENTITLEMENT_USED",
      status: 409,
    });
    expect(storageMock.deleteSignatureAsset).toHaveBeenCalledWith(
      "signatures/entitlement-1/00000000-0000-4000-8000-000000000002.webp",
    );
    expect(txMock.signature.create).not.toHaveBeenCalled();
  });

  it("rejects shirt surface overlap and removes the unused canonical asset", async () => {
    txMock.signature.findMany.mockResolvedValue([{
      surfaceId: "front",
      uvX: 0.31,
      uvY: 0.3,
      width: 0.1,
      height: 0.1,
      rotation: 0,
    }]);

    await expect(createSignature(input)).rejects.toMatchObject({
      code: "SIGNATURE_OVERLAP",
      status: 409,
    });
    expect(txMock.signingEntitlement.updateMany).not.toHaveBeenCalled();
    expect(storageMock.deleteSignatureAsset).toHaveBeenCalled();
  });
});
