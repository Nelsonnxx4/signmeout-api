import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, txMock } = vi.hoisted(() => {
  const tx = {
    ownerProfile: { findUnique: vi.fn() },
    studentVerification: { findFirst: vi.fn() },
    bankAccount: { findUnique: vi.fn() },
    ledgerEntry: { groupBy: vi.fn(), create: vi.fn() },
    withdrawalAlert: { create: vi.fn() },
    withdrawal: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
    },
  };

  return {
    txMock: tx,
    prismaMock: {
      withdrawal: { findUnique: vi.fn() },
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    },
  };
});

vi.mock("../../src/config/database.js", () => ({ prisma: prismaMock }));

import {
  cancelWithdrawal,
  requestWithdrawal,
} from "../../src/modules/withdrawals/withdrawal.service.js";

const withdrawal = {
  id: "withdrawal-1",
  userId: "owner-1",
  amountKobo: 5_000,
  idempotencyKey: "request-key",
  status: "PENDING",
  transferReference: null,
};

describe("requestWithdrawal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(
      async (callback: (client: typeof txMock) => Promise<unknown>) => callback(txMock),
    );
    prismaMock.withdrawal.findUnique.mockResolvedValue(null);
    txMock.ownerProfile.findUnique.mockResolvedValue({
      onboardingCompletedAt: new Date(),
    });
    txMock.studentVerification.findFirst.mockResolvedValue({
      id: "verification-1",
      status: "APPROVED",
      fullName: "Owner",
      admissionNumber: "2020/123",
      documents: [],
    });
    txMock.bankAccount.findUnique.mockResolvedValue({
      bankCode: "001",
      bankName: "Test Bank",
      accountNumber: "1234567890",
      accountName: "Owner",
      paystackRecipient: "RCP_test",
      verifiedAt: new Date(),
    });
    txMock.ledgerEntry.groupBy.mockResolvedValue([
      { entryType: "OWNER_CREDIT", _sum: { amountKobo: 10_000 } },
    ]);
    txMock.withdrawal.create.mockResolvedValue(withdrawal);
    txMock.withdrawal.findFirst.mockResolvedValue(withdrawal);
    txMock.withdrawal.findUniqueOrThrow.mockResolvedValue({
      ...withdrawal,
      status: "CANCELLED",
    });
    txMock.withdrawal.updateMany.mockResolvedValue({ count: 1 });
    txMock.ledgerEntry.create.mockResolvedValue({});
  });

  it("returns an existing withdrawal for a matching idempotency key", async () => {
    prismaMock.withdrawal.findUnique.mockResolvedValue(withdrawal);

    await expect(
      requestWithdrawal("owner-1", 5_000, "request-key"),
    ).resolves.toEqual(withdrawal);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects reusing a key for a different request", async () => {
    prismaMock.withdrawal.findUnique.mockResolvedValue(withdrawal);

    await expect(
      requestWithdrawal("owner-1", 6_000, "request-key"),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED", status: 409 });
  });

  it("reserves funds in a serializable transaction", async () => {
    await requestWithdrawal("owner-1", 5_000, "request-key");

    expect(prismaMock.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: "Serializable" },
    );
    expect(txMock.withdrawal.create).toHaveBeenCalledWith({
      data: {
        userId: "owner-1",
        amountKobo: 5_000,
        idempotencyKey: "request-key",
        status: "PENDING",
        bankCode: "001",
        bankName: "Test Bank",
        accountNumber: "1234567890",
        accountName: "Owner",
        paystackRecipient: "RCP_test",
        adminResponseDeadline: expect.any(Date),
      },
      select: {
        id: true,
        userId: true,
        amountKobo: true,
        status: true,
        idempotencyKey: true,
        requestedAt: true,
        adminResponseDeadline: true,
        transferReference: true,
        processedAt: true,
      },
    });
    expect(txMock.studentVerification.findFirst).toHaveBeenCalledWith({
      where: {
        userId: "owner-1",
        OR: expect.any(Array),
      },
      orderBy: { submittedAt: "desc" },
      select: {
        id: true,
        status: true,
        fullName: true,
        admissionNumber: true,
        documents: { select: { documentType: true } },
      },
    });
    expect(txMock.withdrawalAlert.create).toHaveBeenCalledWith({
      data: { withdrawalId: "withdrawal-1" },
    });
    expect(txMock.ledgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entryType: "WITHDRAWAL_HOLD",
        amountKobo: 5_000,
        idempotencyKey: "request-key:hold",
      }),
    });
  });

  it("does not reserve more than the available balance", async () => {
    await expect(
      requestWithdrawal("owner-1", 10_001, "request-key"),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_BALANCE", status: 409 });
    expect(txMock.withdrawal.create).not.toHaveBeenCalled();
  });

  it("requires the onboarding verification to be submitted before withdrawal", async () => {
    txMock.studentVerification.findFirst.mockResolvedValue(null);

    await expect(
      requestWithdrawal("owner-1", 5_000, "request-key"),
    ).rejects.toMatchObject({ code: "VERIFICATION_REQUIRED", status: 403 });
    expect(txMock.withdrawal.create).not.toHaveBeenCalled();
  });

  it("cancels a pending withdrawal and releases its hold atomically", async () => {
    await expect(cancelWithdrawal("owner-1", "withdrawal-1")).resolves.toMatchObject({
      status: "CANCELLED",
    });

    expect(prismaMock.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: "Serializable" },
    );
    expect(txMock.withdrawal.updateMany).toHaveBeenCalledWith({
      where: {
        id: "withdrawal-1",
        userId: "owner-1",
        status: "PENDING",
        transferReference: null,
      },
      data: { status: "CANCELLED", processedAt: expect.any(Date) },
    });
    expect(txMock.ledgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entryType: "WITHDRAWAL_RELEASE",
        amountKobo: 5_000,
        idempotencyKey: "request-key:release",
      }),
    });
  });

  it("does not release a hold after transfer processing has started", async () => {
    txMock.withdrawal.findFirst.mockResolvedValue({
      ...withdrawal,
      status: "PROCESSING",
      transferReference: "transfer-reference",
    });

    await expect(cancelWithdrawal("owner-1", "withdrawal-1"))
      .rejects.toMatchObject({ code: "WITHDRAWAL_CANNOT_BE_CANCELLED", status: 409 });
    expect(txMock.withdrawal.updateMany).not.toHaveBeenCalled();
    expect(txMock.ledgerEntry.create).not.toHaveBeenCalled();
  });
});
