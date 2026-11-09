import { describe, expect, it } from "vitest";

import { createSignatureUploadUrl } from "../../src/integrations/storage/r2.client.js";

describe("createSignatureUploadUrl", () => {
  it("rejects unsupported formats before accessing storage", async () => {
    await expect(
      createSignatureUploadUrl("entitlement-1", "image/svg+xml", 100),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_SIGNATURE_FORMAT" });
  });

  it("rejects oversized uploads before accessing storage", async () => {
    await expect(
      createSignatureUploadUrl("entitlement-1", "image/png", 5 * 1024 * 1024 + 1),
    ).rejects.toMatchObject({ code: "INVALID_SIGNATURE_FILE_SIZE" });
  });
});
