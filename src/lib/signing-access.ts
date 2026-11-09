import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "../config/env.js";
import { HttpError } from "./http-error.js";

const TOKEN_LIFETIME_SECONDS = 30 * 24 * 60 * 60;

function getSigningSecret() {
  const secret = env.signingTokenSecret ?? env.betterAuthSecret;
  if (!secret) {
    throw new HttpError(503, "SIGNING_NOT_CONFIGURED", "Signing access is not configured.");
  }
  return secret;
}

export function createSigningAccessToken(entitlementId: string) {
  const payload = Buffer.from(
    JSON.stringify({
      entitlementId,
      expiresAt: Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECONDS,
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", getSigningSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifySigningAccessToken(token: string) {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) {
    throw new HttpError(401, "INVALID_SIGNING_TOKEN", "A valid signing access token is required.");
  }

  const expected = createHmac("sha256", getSigningSecret()).update(payload).digest();
  let received: Buffer;
  try {
    received = Buffer.from(signature, "base64url");
  } catch {
    throw new HttpError(401, "INVALID_SIGNING_TOKEN", "A valid signing access token is required.");
  }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new HttpError(401, "INVALID_SIGNING_TOKEN", "A valid signing access token is required.");
  }

  let claims: { entitlementId?: unknown; expiresAt?: unknown };
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as typeof claims;
  } catch {
    throw new HttpError(401, "INVALID_SIGNING_TOKEN", "A valid signing access token is required.");
  }

  if (
    typeof claims.entitlementId !== "string" ||
    typeof claims.expiresAt !== "number" ||
    claims.expiresAt <= Math.floor(Date.now() / 1000)
  ) {
    throw new HttpError(401, "EXPIRED_SIGNING_TOKEN", "The signing access token is invalid or expired.");
  }

  return claims.entitlementId;
}
