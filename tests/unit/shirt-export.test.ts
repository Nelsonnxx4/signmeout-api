import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    shirt: { findFirst: vi.fn() },
  },
}));

vi.mock("../../src/config/database.js", () => ({ prisma: prismaMock }));

import { createShirtExport } from "../../src/modules/shirts/shirt-export.service.js";

describe("shirt exports", () => {
  let capture: Buffer;

  beforeEach(async () => {
    vi.clearAllMocks();
    prismaMock.shirt.findFirst.mockResolvedValue({ slug: "ada-shirt" });
    capture = await sharp({
      create: {
        width: 64,
        height: 32,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 0 },
      },
    }).png().toBuffer();
  });

  it.each([
    ["png", "image/png", ".png"],
    ["jpeg", "image/jpeg", ".jpg"],
    ["pdf", "application/pdf", ".pdf"],
  ] as const)("returns an authenticated %s attachment", async (format, contentType, extension) => {
    const result = await createShirtExport({
      ownerId: "owner-1",
      shirtId: "shirt-1",
      format,
      image: capture,
    });

    expect(prismaMock.shirt.findFirst).toHaveBeenCalledWith({
      where: { id: "shirt-1", ownerId: "owner-1" },
      select: { slug: true },
    });
    expect(result.contentType).toBe(contentType);
    expect(result.filename).toBe(`signmeout-ada-shirt${extension}`);
    expect(result.data.length).toBeGreaterThan(100);
    if (format === "pdf") {
      expect(result.data.subarray(0, 8).toString("ascii")).toBe("%PDF-1.4");
      expect(result.data.toString("latin1")).toContain("/DCTDecode");
    }
  });

  it("does not export a shirt owned by another account", async () => {
    prismaMock.shirt.findFirst.mockResolvedValue(null);

    await expect(createShirtExport({
      ownerId: "owner-2",
      shirtId: "shirt-1",
      format: "png",
      image: capture,
    })).rejects.toMatchObject({ status: 404, code: "SHIRT_NOT_FOUND" });
  });
});
