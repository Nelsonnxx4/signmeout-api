import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, envMock, sendEmail } = vi.hoisted(() => ({
  prismaMock: {
    withdrawalAlert: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
  },
  envMock: {
    adminAlertEmail: "admin@example.com",
    adminAlertWebhookUrl: "https://alerts.example.com/withdrawals",
    adminAlertWebhookSecret: "webhook-secret",
  },
  sendEmail: vi.fn(),
}));

vi.mock("../../src/config/database.js", () => ({ prisma: prismaMock }));
vi.mock("../../src/config/env.js", () => ({ env: envMock }));
vi.mock("../../src/config/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../src/integrations/email.provider.js", () => ({
  emailProvider: { send: sendEmail },
}));

import { processPendingWithdrawalAlerts } from "../../src/modules/withdrawals/withdrawal-alerts.js";

const alert = {
  id: "alert-1",
  emailAttempts: 0,
  webhookAttempts: 0,
  emailSentAt: null,
  webhookSentAt: null,
  withdrawal: {
    id: "withdrawal-1",
    amountKobo: 250_000,
    status: "PENDING",
    requestedAt: new Date("2026-11-09T10:00:00.000Z"),
    adminResponseDeadline: new Date("2026-11-09T10:10:00.000Z"),
    bankName: "Example Bank",
    bankCode: "001",
    accountName: "Contributor",
    accountNumber: "1234567890",
    ownerProfile: {
      user: { name: "Contributor", email: "contributor@example.com" },
    },
  },
};

describe("withdrawal admin alerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.adminAlertEmail = "admin@example.com";
    envMock.adminAlertWebhookUrl = "https://alerts.example.com/withdrawals";
    envMock.adminAlertWebhookSecret = "webhook-secret";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    prismaMock.withdrawalAlert.findMany.mockResolvedValue([alert]);
    prismaMock.withdrawalAlert.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.withdrawalAlert.update.mockResolvedValue({});
    sendEmail.mockResolvedValue(undefined);
  });

  it("sends full payout details by email and signed webhook", async () => {
    await processPendingWithdrawalAlerts();

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "admin@example.com",
        text: expect.stringContaining("Account number: 1234567890"),
      }),
    );
    expect(sendEmail.mock.calls[0][0].text).toContain(
      "Admin response deadline: 2026-11-09T10:10:00.000Z",
    );

    const fetchMock = vi.mocked(fetch);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://alerts.example.com/withdrawals");
    const request = options as RequestInit;
    const headers = new Headers(request.headers);
    const body = String(request.body);
    const timestamp = headers.get("X-SignMeOut-Timestamp")!;
    const signature = createHmac("sha256", envMock.adminAlertWebhookSecret)
      .update(`${timestamp}.${body}`)
      .digest("hex");
    expect(headers.get("X-SignMeOut-Signature")).toBe(`sha256=${signature}`);
    expect(headers.get("Idempotency-Key")).toBe("alert-1");
    expect(JSON.parse(body).payoutAccount.accountNumber).toBe("1234567890");
    expect(prismaMock.withdrawalAlert.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ emailSentAt: expect.any(Date) }),
      }),
    );
    expect(prismaMock.withdrawalAlert.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ webhookSentAt: expect.any(Date) }),
      }),
    );
  });

  it("does not deliver alerts when a channel is not configured", async () => {
    envMock.adminAlertWebhookUrl = "";

    await processPendingWithdrawalAlerts();

    expect(prismaMock.withdrawalAlert.findMany).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("retries failed email without resending the delivered webhook", async () => {
    prismaMock.withdrawalAlert.findMany
      .mockResolvedValueOnce([alert])
      .mockResolvedValueOnce([
        { ...alert, emailAttempts: 1, webhookAttempts: 1, webhookSentAt: new Date() },
      ]);
    sendEmail.mockRejectedValueOnce(new Error("mail service unavailable"));

    await processPendingWithdrawalAlerts();
    await processPendingWithdrawalAlerts();

    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(prismaMock.withdrawalAlert.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          emailAttempts: 1,
          emailLastError: "mail service unavailable",
        }),
      }),
    );
  });
});
