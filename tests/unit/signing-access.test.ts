import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/env.js", () => ({
  env: { signingTokenSecret: "test-signing-secret", betterAuthSecret: undefined },
}));

import {
  createSigningAccessToken,
  verifySigningAccessToken,
} from "../../src/lib/signing-access.js";

describe("signing access tokens", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("authenticates an entitlement and rejects tampering", () => {
    const token = createSigningAccessToken("entitlement-123");

    expect(verifySigningAccessToken(token)).toBe("entitlement-123");
    expect(() => verifySigningAccessToken(`${token}x`)).toThrow();
  });

  it("rejects expired tokens", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-09T10:00:00Z"));
    const token = createSigningAccessToken("entitlement-123");
    vi.setSystemTime(new Date("2026-12-10T10:00:00Z"));

    expect(() => verifySigningAccessToken(token)).toThrow(/expired/i);
  });
});
