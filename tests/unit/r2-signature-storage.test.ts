import { beforeEach, describe, expect, it, vi } from "vitest";

const { s3Mock } = vi.hoisted(() => ({
  s3Mock: { send: vi.fn() },
}));

vi.mock("../../src/config/env.js", () => ({
  env: {
    r2AccountId: "account-id",
    r2AccessKeyId: "access-key",
    r2SecretAccessKey: "secret-key",
    r2BucketName: "private-signatures",
  },
}));

vi.mock("@aws-sdk/client-s3", () => {
  class Command {
    input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  }
  class S3Client {
    send = s3Mock.send;
    constructor() {}
  }
  return {
    CopyObjectCommand: class CopyObjectCommand extends Command {},
    DeleteObjectCommand: class DeleteObjectCommand extends Command {},
    GetObjectCommand: class GetObjectCommand extends Command {},
    HeadObjectCommand: class HeadObjectCommand extends Command {},
    PutObjectCommand: class PutObjectCommand extends Command {},
    S3Client,
  };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async () => "https://r2.example/signed-upload"),
}));

import sharp from "sharp";
import {
  createStudentDocumentUploadUrl,
  createSignatureUploadUrl,
  validateStudentDocumentUpload,
  validateAndStoreSignatureAsset,
} from "../../src/integrations/storage/r2.client.js";

const entitlementId = "00000000-0000-4000-8000-000000000001";
const uploadKey = `signature-uploads/${entitlementId}/00000000-0000-4000-8000-000000000002.png`;

describe("R2 signature storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates an entitlement-scoped short-lived upload URL", async () => {
    const result = await createSignatureUploadUrl(entitlementId, "image/png", 512);

    expect(result).toMatchObject({
      assetKey: expect.stringMatching(new RegExp(`^signature-uploads/${entitlementId}/`)),
      uploadUrl: "https://r2.example/signed-upload",
      expiresInSeconds: 300,
      requiredHeaders: {
        "Content-Type": "image/png",
        "x-amz-meta-entitlement": entitlementId,
      },
    });
  });

  it("normalizes valid uploaded images to private WebP assets", async () => {
    const png = await sharp({
      create: {
        width: 120,
        height: 80,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    }).png().toBuffer();

    s3Mock.send.mockImplementation(async (command: { constructor: { name: string } }) => {
      if (command.constructor.name === "HeadObjectCommand") {
        return {
          Metadata: { entitlement: entitlementId },
          ContentType: "image/png",
          ContentLength: png.length,
        };
      }
      if (command.constructor.name === "GetObjectCommand") {
        return { Body: { transformToWebStream: () => new Response(png).body } };
      }
      return {};
    });

    const canonicalKey = await validateAndStoreSignatureAsset(uploadKey, entitlementId);

    expect(canonicalKey).toMatch(new RegExp(`^signatures/${entitlementId}/[0-9a-f-]+\\.webp$`));
    const putCommand = s3Mock.send.mock.calls.find(
      ([command]) => command.constructor.name === "PutObjectCommand",
    )?.[0] as { input: { Body: Buffer; ContentType: string } } | undefined;
    expect(putCommand?.input.ContentType).toBe("image/webp");
    expect((await sharp(putCommand!.input.Body).metadata()).format).toBe("webp");
  });

  it("rejects uploaded content that is not an allowed image", async () => {
    s3Mock.send.mockImplementation(async (command: { constructor: { name: string } }) => {
      if (command.constructor.name === "HeadObjectCommand") {
        return {
          Metadata: { entitlement: entitlementId },
          ContentType: "image/png",
          ContentLength: 4,
        };
      }
      if (command.constructor.name === "GetObjectCommand") {
        return { Body: { transformToWebStream: () => new Response("nope").body } };
      }
      return {};
    });

    await expect(validateAndStoreSignatureAsset(uploadKey, entitlementId))
      .rejects.toMatchObject({ code: "INVALID_SIGNATURE_IMAGE" });
    expect(
      s3Mock.send.mock.calls.some(
        ([command]) => command.constructor.name === "PutObjectCommand",
      ),
    ).toBe(false);
  });

  it("creates owner-scoped student document upload URLs", async () => {
    const result = await createStudentDocumentUploadUrl(entitlementId, "application/pdf", 2048);

    expect(result).toMatchObject({
      assetKey: expect.stringMatching(new RegExp(`^verification-uploads/${entitlementId}/[0-9a-f-]+\\.pdf$`)),
      uploadUrl: "https://r2.example/signed-upload",
      expiresInSeconds: 300,
      requiredHeaders: {
        "Content-Type": "application/pdf",
        "x-amz-meta-owner": entitlementId,
      },
    });
  });

  it("validates and moves a PDF into permanent private student storage", async () => {
    const pdf = Buffer.from("%PDF-1.7\nstudent record");
    s3Mock.send.mockImplementation(async (command: { constructor: { name: string } }) => {
      if (command.constructor.name === "HeadObjectCommand") {
        return {
          Metadata: { owner: entitlementId },
          ContentType: "application/pdf",
          ContentLength: pdf.length,
        };
      }
      if (command.constructor.name === "GetObjectCommand") {
        return { Body: { transformToWebStream: () => new Response(pdf).body } };
      }
      return {};
    });

    const documentKey = `verification-uploads/${entitlementId}/00000000-0000-4000-8000-000000000002.pdf`;
    const result = await validateStudentDocumentUpload(documentKey, entitlementId);

    expect(result).toMatchObject({
      storageKey: expect.stringMatching(new RegExp(`^student-verifications/${entitlementId}/[0-9a-f-]+\\.pdf$`)),
      mimeType: "application/pdf",
      sizeBytes: pdf.length,
      checksumSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    const copyCommand = s3Mock.send.mock.calls.find(
      ([command]) => command.constructor.name === "CopyObjectCommand",
    )?.[0] as { input: { Metadata: { owner: string }; ContentType: string } } | undefined;
    expect(copyCommand?.input.Metadata.owner).toBe(entitlementId);
    expect(copyCommand?.input.ContentType).toBe("application/pdf");
  });
});
