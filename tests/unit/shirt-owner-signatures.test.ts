import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    shirt: { findFirst: vi.fn() },
  },
}));

vi.mock("../../src/config/database.js", () => ({ prisma: prismaMock }));
vi.mock("../../src/config/env.js", () => ({
  env: { frontendUrl: "http://localhost:5173" },
}));

import { listOwnerSignatures } from "../../src/modules/shirts/shirt.service.js";

describe("owner signature feed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.shirt.findFirst.mockResolvedValue({
      id: "shirt-1",
      signatures: [{
        id: "signature-1",
        assetKey: "signatures/session/signature.webp",
        inkColor: "blue",
        penWidthMm: 1.5,
        surfaceId: "front",
        uvX: 0.4,
        uvY: 0.5,
        width: 0.2,
        height: 0.1,
        rotation: 0,
        scale: 1,
        submittedAt: new Date("2026-11-15T20:00:00.000Z"),
        visibility: "VISIBLE",
        payment: { contributorName: "Ada Lovelace" },
      }],
    });
  });

  it("returns style and contributor details only to the owning account", async () => {
    const signatures = await listOwnerSignatures("owner-1", "shirt-1");

    expect(prismaMock.shirt.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "shirt-1", ownerId: "owner-1" } }),
    );
    expect(signatures[0]).toMatchObject({
      id: "signature-1",
      contributorName: "Ada Lovelace",
      inkColor: "blue",
      penWidthMm: 1.5,
      assetUrl: "/api/v1/public/signatures/signature-1/asset",
    });
    expect(signatures[0]).not.toHaveProperty("payment");
    expect(signatures[0]).not.toHaveProperty("assetKey");
  });
});
