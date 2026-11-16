import { describe, expect, it } from "vitest";

import { getSignaturePlaygroundOptions } from "../../src/modules/signatures/signature-options.js";
import { createSignatureSchema } from "../../src/modules/signatures/signature.schema.js";

const placement = {
  surfaceId: "front",
  assetKey: "signature-uploads/session/signature.png",
  uvX: 0.5,
  uvY: 0.5,
  width: 0.2,
  height: 0.1,
  rotation: 0,
  scale: 1,
};

describe("signature playground options", () => {
  it("publishes the five requested colors and three pen widths", () => {
    const options = getSignaturePlaygroundOptions();

    expect(options.colors.map(({ id }) => id)).toEqual([
      "red",
      "green",
      "black",
      "blue",
      "purple",
    ]);
    expect(options.penSizes.map(({ widthMm }) => widthMm)).toEqual([1.5, 2.5, 3.5]);
    expect(options.defaults).toEqual({ inkColor: "black", penWidthMm: 2.5 });
  });

  it("defaults older clients and rejects unsupported styles", () => {
    expect(createSignatureSchema.parse(placement)).toMatchObject({
      inkColor: "black",
      penWidthMm: 2.5,
    });
    expect(createSignatureSchema.safeParse({ ...placement, inkColor: "orange" }).success).toBe(false);
    expect(createSignatureSchema.safeParse({ ...placement, penWidthMm: 4 }).success).toBe(false);
  });
});
