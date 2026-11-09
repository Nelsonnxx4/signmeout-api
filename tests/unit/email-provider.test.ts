import { afterEach, describe, expect, it, vi } from "vitest";

import { ResendEmailProvider } from "../../src/integrations/email.provider.js";

describe("Resend email provider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends an email with an optional idempotency key", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new ResendEmailProvider("resend-key", "SignMeOut <noreply@example.com>");

    await provider.send({
      to: "admin@example.com",
      subject: "Withdrawal request",
      text: "Account number: 1234567890",
      idempotencyKey: "alert-1",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer resend-key",
          "Idempotency-Key": "alert-1",
        }),
        body: JSON.stringify({
          from: "SignMeOut <noreply@example.com>",
          to: ["admin@example.com"],
          subject: "Withdrawal request",
          text: "Account number: 1234567890",
        }),
      }),
    );
  });

  it("surfaces provider rejection so the outbox can retry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
    const provider = new ResendEmailProvider("resend-key", "noreply@example.com");

    await expect(
      provider.send({
        to: "admin@example.com",
        subject: "Withdrawal request",
        text: "Details",
      }),
    ).rejects.toThrow("Resend email delivery failed with HTTP 503.");
  });
});
