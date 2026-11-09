import { createHash, randomUUID } from "node:crypto";

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import sharp, { type Metadata } from "sharp";

import { env } from "../../config/env.js";
import { HttpError } from "../../lib/http-error.js";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 2_000;
const MAX_IMAGE_PIXELS = 4_000_000;
const UPLOAD_CONTENT_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_VERIFICATION_DOCUMENT_BYTES = 10 * 1024 * 1024;
const VERIFICATION_DOCUMENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
]);

const client =
  env.r2AccountId && env.r2AccessKeyId && env.r2SecretAccessKey
    ? new S3Client({
        region: "auto",
        endpoint: `https://${env.r2AccountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: env.r2AccessKeyId,
          secretAccessKey: env.r2SecretAccessKey,
        },
      })
    : null;

function getStorageConfig() {
  if (!client || !env.r2BucketName) {
    throw new HttpError(503, "SIGNATURE_STORAGE_NOT_CONFIGURED", "Signature storage is not configured.");
  }
  return { client, bucket: env.r2BucketName };
}

export async function createSignatureUploadUrl(
  entitlementId: string,
  contentType: string,
  sizeBytes: number,
) {
  if (!UPLOAD_CONTENT_TYPES.has(contentType)) {
    throw new HttpError(400, "UNSUPPORTED_SIGNATURE_FORMAT", "Upload a PNG, JPEG, or WebP image.");
  }
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_UPLOAD_BYTES) {
    throw new HttpError(400, "INVALID_SIGNATURE_FILE_SIZE", "Signature files must be 5 MB or smaller.");
  }

  const { client: s3, bucket } = getStorageConfig();
  const extension = contentType === "image/jpeg" ? "jpg" : contentType.slice("image/".length);
  const assetKey = `signature-uploads/${entitlementId}/${randomUUID()}.${extension}`;
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: bucket,
      Key: assetKey,
      ContentType: contentType,
      ContentLength: sizeBytes,
      Metadata: { entitlement: entitlementId },
    }),
    { expiresIn: 300 },
  );

  return {
    assetKey,
    uploadUrl,
    expiresInSeconds: 300,
    requiredHeaders: {
      "Content-Type": contentType,
      "Content-Length": String(sizeBytes),
      "x-amz-meta-entitlement": entitlementId,
    },
  };
}

export async function validateAndStoreSignatureAsset(
  assetKey: string,
  entitlementId: string,
) {
  if (!new RegExp(`^signature-uploads/${entitlementId}/[0-9a-f-]{36}\\.(png|jpg|webp)$`, "i").test(assetKey)) {
    throw new HttpError(400, "INVALID_SIGNATURE_ASSET", "The uploaded asset does not belong to this signing session.");
  }

  const { client: s3, bucket } = getStorageConfig();
  const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: assetKey }));
  if (
    head.Metadata?.entitlement !== entitlementId ||
    !head.ContentType ||
    !UPLOAD_CONTENT_TYPES.has(head.ContentType) ||
    !head.ContentLength ||
    head.ContentLength > MAX_UPLOAD_BYTES
  ) {
    throw new HttpError(400, "INVALID_SIGNATURE_ASSET", "The uploaded asset is invalid or too large.");
  }

  const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: assetKey }));
  if (!result.Body) {
    throw new HttpError(400, "INVALID_SIGNATURE_ASSET", "The uploaded asset is empty.");
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  const reader = result.Body.transformToWebStream().getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_UPLOAD_BYTES) {
      await reader.cancel();
      throw new HttpError(400, "INVALID_SIGNATURE_ASSET", "The uploaded asset is too large.");
    }
    chunks.push(Buffer.from(value));
  }
  reader.releaseLock();
  const input = Buffer.concat(chunks, totalBytes);
  if (input.length !== head.ContentLength || input.length > MAX_UPLOAD_BYTES) {
    throw new HttpError(400, "INVALID_SIGNATURE_ASSET", "The uploaded asset size is invalid.");
  }

  let image: Metadata;
  try {
    image = await sharp(input, { limitInputPixels: MAX_IMAGE_PIXELS }).metadata();
  } catch {
    throw new HttpError(400, "INVALID_SIGNATURE_IMAGE", "The signature file is not a valid supported image.");
  }

  if (
    !image.width ||
    !image.height ||
    image.width > MAX_IMAGE_DIMENSION ||
    image.height > MAX_IMAGE_DIMENSION ||
    (image.width * image.height) > MAX_IMAGE_PIXELS ||
    image.pages !== undefined && image.pages > 1 ||
    !["png", "jpeg", "webp"].includes(image.format ?? "")
  ) {
    throw new HttpError(400, "INVALID_SIGNATURE_IMAGE", "The signature image dimensions or format are not supported.");
  }

  let normalized: Buffer;
  try {
    normalized = await sharp(input, { limitInputPixels: MAX_IMAGE_PIXELS })
      .rotate()
      .resize({ width: MAX_IMAGE_DIMENSION, height: MAX_IMAGE_DIMENSION, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer();
  } catch {
    throw new HttpError(400, "INVALID_SIGNATURE_IMAGE", "The signature image could not be normalized.");
  }

  const canonicalAssetKey = `signatures/${entitlementId}/${randomUUID()}.webp`;
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: canonicalAssetKey,
    Body: normalized,
    ContentType: "image/webp",
    ContentLength: normalized.length,
    Metadata: { entitlement: entitlementId },
  }));

  return canonicalAssetKey;
}

export async function createStudentDocumentUploadUrl(
  userId: string,
  contentType: string,
  sizeBytes: number,
) {
  if (!VERIFICATION_DOCUMENT_TYPES.has(contentType)) {
    throw new HttpError(400, "UNSUPPORTED_VERIFICATION_DOCUMENT", "Upload a PNG, JPEG, WebP, or PDF document.");
  }
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_VERIFICATION_DOCUMENT_BYTES) {
    throw new HttpError(400, "INVALID_VERIFICATION_DOCUMENT_SIZE", "Student documents must be 10 MB or smaller.");
  }

  const { client: s3, bucket } = getStorageConfig();
  const extension = contentType === "image/jpeg"
    ? "jpg"
    : contentType === "application/pdf"
      ? "pdf"
      : contentType.slice("image/".length);
  const assetKey = `verification-uploads/${userId}/${randomUUID()}.${extension}`;
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: bucket,
      Key: assetKey,
      ContentType: contentType,
      ContentLength: sizeBytes,
      Metadata: { owner: userId },
    }),
    { expiresIn: 300 },
  );

  return {
    assetKey,
    uploadUrl,
    expiresInSeconds: 300,
    requiredHeaders: {
      "Content-Type": contentType,
      "Content-Length": String(sizeBytes),
      "x-amz-meta-owner": userId,
    },
  };
}

export async function validateStudentDocumentUpload(assetKey: string, userId: string) {
  if (!new RegExp(`^verification-uploads/${userId}/[0-9a-f-]{36}\\.(png|jpg|webp|pdf)$`, "i").test(assetKey)) {
    throw new HttpError(400, "INVALID_VERIFICATION_DOCUMENT", "The uploaded document does not belong to this account.");
  }

  const { client: s3, bucket } = getStorageConfig();
  const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: assetKey }));
  if (
    head.Metadata?.owner !== userId ||
    !head.ContentType ||
    !VERIFICATION_DOCUMENT_TYPES.has(head.ContentType) ||
    !head.ContentLength ||
    head.ContentLength > MAX_VERIFICATION_DOCUMENT_BYTES
  ) {
    throw new HttpError(400, "INVALID_VERIFICATION_DOCUMENT", "The uploaded document is invalid or too large.");
  }

  const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: assetKey }));
  if (!result.Body) {
    throw new HttpError(400, "INVALID_VERIFICATION_DOCUMENT", "The uploaded document is empty.");
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  const reader = result.Body.transformToWebStream().getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_VERIFICATION_DOCUMENT_BYTES) {
      await reader.cancel();
      throw new HttpError(400, "INVALID_VERIFICATION_DOCUMENT", "The uploaded document is too large.");
    }
    chunks.push(Buffer.from(value));
  }
  reader.releaseLock();

  const file = Buffer.concat(chunks, totalBytes);
  if (file.length !== head.ContentLength || file.length === 0) {
    throw new HttpError(400, "INVALID_VERIFICATION_DOCUMENT", "The uploaded document size is invalid.");
  }

  if (head.ContentType === "application/pdf") {
    if (!file.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      throw new HttpError(400, "INVALID_VERIFICATION_DOCUMENT", "The uploaded file is not a valid PDF document.");
    }
  } else {
    let image: Metadata;
    try {
      image = await sharp(file, { limitInputPixels: MAX_IMAGE_PIXELS }).metadata();
    } catch {
      throw new HttpError(400, "INVALID_VERIFICATION_DOCUMENT", "The uploaded file is not a valid supported image.");
    }
    const expectedFormat = head.ContentType === "image/jpeg"
      ? "jpeg"
      : head.ContentType.slice("image/".length);
    if (image.format !== expectedFormat || !image.width || !image.height || image.pages !== undefined && image.pages > 1) {
      throw new HttpError(400, "INVALID_VERIFICATION_DOCUMENT", "The uploaded image format is invalid or unsupported.");
    }
  }

  const extension = assetKey.slice(assetKey.lastIndexOf(".") + 1).toLowerCase();
  const canonicalKey = `student-verifications/${userId}/${randomUUID()}.${extension}`;
  await s3.send(new CopyObjectCommand({
    Bucket: bucket,
    Key: canonicalKey,
    CopySource: `${bucket}/${assetKey}`,
    MetadataDirective: "REPLACE",
    ContentType: head.ContentType,
    ContentDisposition: "attachment",
    Metadata: { owner: userId },
  }));

  return {
    storageKey: canonicalKey,
    mimeType: head.ContentType,
    sizeBytes: file.length,
    checksumSha256: createHash("sha256").update(file).digest("hex"),
  };
}

export async function createSignatureReadUrl(assetKey: string) {
  if (!/^signatures\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/i.test(assetKey)) {
    throw new HttpError(404, "SIGNATURE_ASSET_NOT_FOUND", "Signature asset not found.");
  }
  const { client: s3, bucket } = getStorageConfig();
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: assetKey }),
    { expiresIn: 300 },
  );
}

export async function deleteSignatureAsset(assetKey: string) {
  const { client: s3, bucket } = getStorageConfig();
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: assetKey }));
}
