import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, txMock, transferConfig, paystackMock } = vi.hoisted(() => {
  const tx = {
    withdrawal: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    withdrawalEvent: { create: vi.fn() },
    ledgerEntry: { create: vi.fn() },
    adminAuditLog: { create: vi.fn() },
  };
  return {
    txMock: tx,
    transferConfig: { enabled: false },
    paystackMock: {
      createTransferRecipient: vi.fn(),
      initiateTransfer: vi.fn(),
      verifyTransfer: vi.fn(),
    },
    prismaMock: {
      withdrawal: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
      bankAccount: { findUnique: vi.fn(), update: vi.fn() },
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    },
  };
});

vi.mock("../../src/config/database.js", () => ({ prisma: prismaMock }));
vi.mock("../../src/config/env.js", () => ({
  env: { get paystackTransfersEnabled() { return transferConfig.enabled; } },
}));
vi.mock("../../src/integrations/paystack/paystack.client.js", () => ({
  createTransferRecipient: paystackMock.createTransferRecipient,
  initiateTransfer: paystackMock.initiateTransfer,
  verifyTransfer: paystackMock.verifyTransfer,
  PaystackError: class PaystackError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

import {
  initiateWithdrawalTransfer,
  processPaystackTransferWebhook,
} from "../../src/modules/withdrawals/withdrawal.service.js";

const pendingWithdrawal = {
  id: "withdrawal-1",
  userId: "owner-1",
  amountKobo: 10_000,
  status: "PROCESSING",
  idempotencyKey: "idem-1",
  transferReference: "SMO-TRF-1",
  bankCode: "001",
  bankName: "Test Bank",
  accountNumber: "1234567890",
  accountName: "Owner",
  paystackRecipient: "RCP_test",
};

describe("Paystack withdrawal transfers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transferConfig.enabled = false;
    prismaMock.$transaction.mockImplementation(
      async (callback: (client: typeof txMock) => Promise<unknown>) => callback(txMock),
    );
    txMock.withdrawal.findUnique.mockResolvedValue(pendingWithdrawal);
    prismaMock.withdrawal.findUnique.mockResolvedValue({
      id: pendingWithdrawal.id,
      amountKobo: pendingWithdrawal.amountKobo,
    });
    txMock.withdrawal.updateMany.mockResolvedValue({ count: 1 });
    txMock.withdrawal.findUniqueOrThrow.mockResolvedValue({
      ...pendingWithdrawal,
      status: "PAID",
    });
    txMock.withdrawalEvent.create.mockResolvedValue({});
    txMock.ledgerEntry.create.mockResolvedValue({});
    txMock.adminAuditLog.create.mockResolvedValue({});
    prismaMock.withdrawal.update.mockResolvedValue({});
  });

  it("marks a transfer paid and records completion only after a success event", async () => {
    const result = await processPaystackTransferWebhook({
      eventType: "transfer.success",
      reference: pendingWithdrawal.transferReference,
      amount: pendingWithdrawal.amountKobo,
      currency: "NGN",
      rawPayload: { event: "transfer.success" },
    });

    expect(result.status).toBe("PAID");
    expect(txMock.withdrawal.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PAID" }) }),
    );
    expect(txMock.ledgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entryType: "WITHDRAWAL_COMPLETED",
        idempotencyKey: "idem-1:completed",
      }),
    });
  });

  it("releases a held balance only after a confirmed transfer failure", async () => {
    txMock.withdrawal.findUnique.mockResolvedValue({
      ...pendingWithdrawal,
      status: "PROCESSING",
    });

    await processPaystackTransferWebhook({
      eventType: "transfer.failed",
      reference: pendingWithdrawal.transferReference,
      rawPayload: { event: "transfer.failed" },
    });

    expect(txMock.ledgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entryType: "WITHDRAWAL_RELEASE",
        idempotencyKey: "idem-1:release",
      }),
    });
  });

  it("restores a paid withdrawal through an explicit reversal ledger entry", async () => {
    txMock.withdrawal.findUnique.mockResolvedValue({
      ...pendingWithdrawal,
      status: "PAID",
    });

    await processPaystackTransferWebhook({
      eventType: "transfer.reversed",
      reference: pendingWithdrawal.transferReference,
      rawPayload: { event: "transfer.reversed" },
    });

    expect(txMock.ledgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entryType: "WITHDRAWAL_REVERSAL",
        idempotencyKey: "idem-1:reversal",
      }),
    });
  });

  it("does not create another completion when a success event is redelivered", async () => {
    txMock.withdrawal.findUnique.mockResolvedValue({
      ...pendingWithdrawal,
      status: "PAID",
    });

    await processPaystackTransferWebhook({
      eventType: "transfer.success",
      reference: pendingWithdrawal.transferReference,
      amount: pendingWithdrawal.amountKobo,
      currency: "NGN",
      rawPayload: { event: "transfer.success" },
    });

    expect(txMock.withdrawal.updateMany).not.toHaveBeenCalled();
    expect(txMock.ledgerEntry.create).not.toHaveBeenCalled();
  });

  it("does not allow payout while transfers are disabled", async () => {
    await expect(initiateWithdrawalTransfer("admin-1", "withdrawal-1"))
      .rejects.toMatchObject({ code: "TRANSFERS_DISABLED", status: 503 });
    expect(prismaMock.withdrawal.findUnique).not.toHaveBeenCalled();
  });

  it("does not mark a withdrawal paid from the initiation response", async () => {
    transferConfig.enabled = true;
    prismaMock.withdrawal.findUnique.mockResolvedValue({
      ...pendingWithdrawal,
      status: "PENDING",
      transferReference: null,
    });
    txMock.withdrawal.updateMany.mockResolvedValue({ count: 1 });
    txMock.withdrawal.findUniqueOrThrow.mockResolvedValue({
      ...pendingWithdrawal,
      status: "PROCESSING",
      transferReference: "SMO-TRF-test",
    });
    prismaMock.withdrawal.findUniqueOrThrow.mockResolvedValue({
      ...pendingWithdrawal,
      status: "PROCESSING",
      transferReference: "SMO-TRF-test",
    });
    paystackMock.initiateTransfer.mockResolvedValue({
      reference: "SMO-TRF-test",
      status: "success",
    });

    const result = await initiateWithdrawalTransfer("admin-1", "withdrawal-1");

    expect(result.status).toBe("PROCESSING");
    expect(txMock.ledgerEntry.create).not.toHaveBeenCalled();
    expect(txMock.withdrawal.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PROCESSING" }),
      }),
    );
  });

  it("uses the bank details snapshotted when the withdrawal was requested", async () => {
    transferConfig.enabled = true;
    prismaMock.withdrawal.findUnique.mockResolvedValue({
      ...pendingWithdrawal,
      status: "PENDING",
      transferReference: null,
      bankCode: "044",
      bankName: "Request-time Bank",
      accountNumber: "9876543210",
      accountName: "Request-time Name",
      paystackRecipient: null,
    });
    paystackMock.createTransferRecipient.mockResolvedValue("RCP_snapshot");
    prismaMock.withdrawal.findUniqueOrThrow.mockResolvedValue({
      ...pendingWithdrawal,
      status: "PROCESSING",
      transferReference: "SMO-TRF-test",
    });
    paystackMock.initiateTransfer.mockResolvedValue({
      reference: "SMO-TRF-test",
      status: "otp",
    });

    await initiateWithdrawalTransfer("admin-1", "withdrawal-1");

    expect(paystackMock.createTransferRecipient).toHaveBeenCalledWith({
      name: "Request-time Name",
      accountNumber: "9876543210",
      bankCode: "044",
    });
    expect(prismaMock.withdrawal.update).toHaveBeenCalledWith({
      where: { id: "withdrawal-1" },
      data: { paystackRecipient: "RCP_snapshot" },
    });
  });

  it("reconciles an independently verified success for the exact transfer amount", async () => {
    const { reconcileWithdrawalTransfer } = await import(
      "../../src/modules/withdrawals/withdrawal.service.js"
    );
    transferConfig.enabled = true;
    prismaMock.withdrawal.findUnique.mockResolvedValue(pendingWithdrawal);
    paystackMock.verifyTransfer.mockResolvedValue({
      reference: pendingWithdrawal.transferReference,
      amount: pendingWithdrawal.amountKobo,
      currency: "NGN",
      status: "success",
    });

    await reconcileWithdrawalTransfer("admin-1", "withdrawal-1");

    expect(txMock.ledgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ entryType: "WITHDRAWAL_COMPLETED" }),
    });
  });
});
