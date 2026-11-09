import { describe, expect, it } from "vitest";

import {
  shirtPlacementConfigSchema,
  validateSignaturePlacement,
} from "../../src/modules/signatures/placement.rules.js";

const config = {
  version: 1,
  surfaces: [
    {
      id: "front",
      bounds: { minX: 0.1, minY: 0.1, maxX: 0.9, maxY: 0.9 },
      restrictedRegions: [{ minX: 0.4, minY: 0.1, maxX: 0.6, maxY: 0.5 }],
      maxSignatureWidth: 0.4,
      maxSignatureHeight: 0.3,
    },
  ],
};

describe("shirtPlacementConfigSchema", () => {
  it("rejects malformed or out-of-range model geometry", () => {
    expect(shirtPlacementConfigSchema.safeParse(config).success).toBe(true);
    expect(
      shirtPlacementConfigSchema.safeParse({
        ...config,
        surfaces: [{ ...config.surfaces[0], bounds: { minX: 0.8, minY: 0.2, maxX: 0.2, maxY: 0.9 } }],
      }).success,
    ).toBe(false);
  });
});

describe("validateSignaturePlacement", () => {
  const position = {
    surfaceId: "front",
    uvX: 0.25,
    uvY: 0.65,
    width: 0.1,
    height: 0.08,
    rotation: 0,
  };

  it("allows a placement inside a configured signing region", () => {
    expect(validateSignaturePlacement(config, position, [], 2, 2).valid).toBe(true);
  });

  it("rejects unknown surfaces, restricted areas, bounds violations, and oversized scales", () => {
    expect(validateSignaturePlacement(config, { ...position, surfaceId: "sleeve" }, [], 2, 1))
      .toMatchObject({ valid: false, reason: "INVALID_SIGNING_SURFACE" });
    expect(validateSignaturePlacement(config, { ...position, uvX: 0.5, uvY: 0.3 }, [], 2, 1))
      .toMatchObject({ valid: false, reason: "SIGNATURE_ON_RESTRICTED_REGION" });
    expect(validateSignaturePlacement(config, { ...position, uvX: 0.12 }, [], 2, 1))
      .toMatchObject({ valid: false, reason: "SIGNATURE_OUT_OF_BOUNDS" });
    expect(validateSignaturePlacement(config, position, [], 1, 2))
      .toMatchObject({ valid: false, reason: "INVALID_SIGNATURE_SIZE_OR_POSITION" });
  });

  it("rejects overlaps with existing signatures on the same surface", () => {
    expect(
      validateSignaturePlacement(
        config,
        position,
        [{ ...position, uvX: 0.32 }],
        2,
        1,
      ),
    ).toMatchObject({ valid: false, reason: "SIGNATURE_OVERLAP" });
  });

  it("fails closed when no model configuration exists", () => {
    expect(validateSignaturePlacement(null, position, [], 2, 1))
      .toMatchObject({ valid: false, reason: "PLACEMENT_CONFIGURATION_UNAVAILABLE" });
  });
});
