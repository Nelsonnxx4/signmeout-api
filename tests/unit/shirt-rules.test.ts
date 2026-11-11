import { describe, expect, it } from "vitest";

import { toPublicSignature, toPublicShirt } from "../../src/modules/shirts/shirt.rules.js";

describe("public shirt transforms", () => {
  it("exposes only public shirt metadata", () => {
    const publicShirt = toPublicShirt({
      slug: "alpha-123",
      shirtType: "SHORT_SLEEVE",
      status: "ACTIVE",
      owner: {
        name: "Ada",
        ownerProfile: {
          school: { name: "University of Lagos", status: "APPROVED" },
        },
      },
      modelVersion: {
        version: 7,
        modelKey: "shirt-short-sleeve-v7",
        placementConfig: {
          version: 7,
          surfaces: [{
            id: "front",
            bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
            restrictedRegions: [],
            maxSignatureWidth: 0.25,
            maxSignatureHeight: 0.25,
          }],
        },
      },
    });

    expect(publicShirt).toMatchObject({
      slug: "alpha-123",
      shirtType: "SHORT_SLEEVE",
      ownerName: "Ada",
      school: "University of Lagos",
      signingAvailable: true,
    });
    expect(publicShirt).not.toHaveProperty("ownerProfile");
  });

  it("serializes a public signature for the shirt page", () => {
    const signature = toPublicSignature({
      id: "sig-1",
      assetKey: "shirts/abc/signature.png",
      surfaceId: "front-left",
      uvX: 0.12,
      uvY: 0.44,
      width: 42,
      height: 18,
      rotation: 15,
      scale: 1.2,
      submittedAt: new Date("2025-01-15T12:00:00.000Z"),
      visibility: "VISIBLE",
    });

    expect(signature).toMatchObject({
      id: "sig-1",
      surfaceId: "front-left",
      position: { x: 0.12, y: 0.44 },
      size: { width: 42, height: 18 },
      visibility: "VISIBLE",
    });
    expect(signature).not.toHaveProperty("assetKey");
  });

  it("fails closed when placement configuration is missing", () => {
    const publicShirt = toPublicShirt({
      slug: "not-ready",
      shirtType: "SHORT_SLEEVE",
      status: "ACTIVE",
      owner: { name: "Ada" },
      modelVersion: { version: 1, modelKey: "short-v1", placementConfig: null },
    });

    expect(publicShirt.signingAvailable).toBe(false);
    expect(publicShirt.remainingSigningSlots).toBe(0);
  });
});
