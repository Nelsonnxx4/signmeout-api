import sharp from "sharp";

import { prisma } from "../../config/database.js";
import { HttpError } from "../../lib/http-error.js";
import type { ShirtExportFormat } from "./shirt-export.schema.js";

const MAX_EXPORT_BYTES = 12 * 1024 * 1024;
const MAX_EXPORT_DIMENSION = 4_096;
const MAX_EXPORT_PIXELS = MAX_EXPORT_DIMENSION * MAX_EXPORT_DIMENSION;

function buildPdfFromJpeg(jpeg: Buffer, imageWidth: number, imageHeight: number) {
  const landscape = imageWidth > imageHeight;
  const pageWidth = landscape ? 842 : 595;
  const pageHeight = landscape ? 595 : 842;
  const margin = 36;
  const scale = Math.min(
    (pageWidth - margin * 2) / imageWidth,
    (pageHeight - margin * 2) / imageHeight,
  );
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  const x = (pageWidth - drawWidth) / 2;
  const y = (pageHeight - drawHeight) / 2;
  const content = Buffer.from(
    `q\n${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm\n/Im0 Do\nQ\n`,
    "ascii",
  );

  const objects = [
    Buffer.from("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n", "ascii"),
    Buffer.from("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n", "ascii"),
    Buffer.from(
      `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
      "ascii",
    ),
    Buffer.concat([
      Buffer.from(
        `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
        "ascii",
      ),
      jpeg,
      Buffer.from("\nendstream\nendobj\n", "ascii"),
    ]),
    Buffer.concat([
      Buffer.from(`5 0 obj\n<< /Length ${content.length} >>\nstream\n`, "ascii"),
      content,
      Buffer.from("endstream\nendobj\n", "ascii"),
    ]),
  ];

  const header = Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "binary");
  const offsets: number[] = [];
  let offset = header.length;
  for (const object of objects) {
    offsets.push(offset);
    offset += object.length;
  }

  const xrefOffset = offset;
  const xref = Buffer.from(
    [
      "xref",
      "0 6",
      "0000000000 65535 f ",
      ...offsets.map((value) => `${String(value).padStart(10, "0")} 00000 n `),
      "trailer",
      "<< /Size 6 /Root 1 0 R >>",
      "startxref",
      String(xrefOffset),
      "%%EOF",
      "",
    ].join("\n"),
    "ascii",
  );

  return Buffer.concat([header, ...objects, xref]);
}

function validateInputBuffer(input: unknown): asserts input is Buffer {
  if (!Buffer.isBuffer(input) || input.length < 1 || input.length > MAX_EXPORT_BYTES) {
    throw new HttpError(
      400,
      "INVALID_SHIRT_EXPORT_IMAGE",
      "Upload a PNG or JPEG shirt capture no larger than 12 MB.",
    );
  }
}

export async function createShirtExport({
  ownerId,
  shirtId,
  format,
  image,
}: {
  ownerId: string;
  shirtId: string;
  format: ShirtExportFormat;
  image: unknown;
}) {
  const shirt = await prisma.shirt.findFirst({
    where: { id: shirtId, ownerId },
    select: { slug: true },
  });
  if (!shirt) throw new HttpError(404, "SHIRT_NOT_FOUND", "Shirt not found.");

  validateInputBuffer(image);
  const pipeline = sharp(image, { limitInputPixels: MAX_EXPORT_PIXELS }).rotate();
  let metadata;
  try {
    metadata = await pipeline.metadata();
  } catch {
    throw new HttpError(
      400,
      "INVALID_SHIRT_EXPORT_IMAGE",
      "The shirt capture is not a valid PNG or JPEG image.",
    );
  }

  if (
    !metadata.width ||
    !metadata.height ||
    metadata.width > MAX_EXPORT_DIMENSION ||
    metadata.height > MAX_EXPORT_DIMENSION ||
    metadata.width * metadata.height > MAX_EXPORT_PIXELS ||
    (metadata.pages !== undefined && metadata.pages > 1) ||
    !["png", "jpeg"].includes(metadata.format ?? "")
  ) {
    throw new HttpError(
      400,
      "INVALID_SHIRT_EXPORT_IMAGE",
      "The shirt capture dimensions or format are not supported.",
    );
  }

  if (format === "png") {
    const data = await pipeline.png({ compressionLevel: 9 }).toBuffer();
    return {
      data,
      contentType: "image/png",
      filename: `signmeout-${shirt.slug}.png`,
    };
  }

  const { data: jpeg, info } = await pipeline
    .flatten({ background: "#ffffff" })
    .toColourspace("srgb")
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer({ resolveWithObject: true });

  if (format === "jpeg") {
    return {
      data: jpeg,
      contentType: "image/jpeg",
      filename: `signmeout-${shirt.slug}.jpg`,
    };
  }

  return {
    data: buildPdfFromJpeg(jpeg, info.width, info.height),
    contentType: "application/pdf",
    filename: `signmeout-${shirt.slug}.pdf`,
  };
}
