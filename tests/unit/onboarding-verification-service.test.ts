import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, txMock } = vi.hoisted(() => {
  const tx = {
    studentVerification: { create: vi.fn() },
    ownerProfile: { updateMany: vi.fn() },
    user: { findUnique: vi.fn() },
    emailOutbox: { upsert: vi.fn() },
  };
  return {
    txMock: tx,
    prismaMock: {
      ownerProfile: { findUnique: vi.fn(), update: vi.fn() },
      bankAccount: { findUnique: vi.fn() },
      commissionAcceptance: { findUnique: vi.fn() },
      studentVerification: { findFirst: vi.fn() },
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    },
  };
});

vi.mock("../../src/config/database.js", () => ({ prisma: prismaMock }));
vi.mock("../../src/config/logger.js", () => ({
  logger: { error: vi.fn() },
}));
vi.mock("../../src/integrations/paystack/paystack.client.js", () => ({
  PaystackError: class PaystackError extends Error {},
  createTransferRecipient: vi.fn(),
  listBanks: vi.fn(),
  resolveAccount: vi.fn(),
}));
vi.mock("../../src/modules/banks/bank.service.js", () => ({
  mapPaystackError: (error: unknown) => error,
}));

import { submitStudentVerification } from "../../src/modules/onboarding/onboarding.service.js";

describe("submitStudentVerification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(
      async (callback: (client: typeof txMock) => Promise<unknown>) => callback(txMock),
    );
    prismaMock.ownerProfile.findUnique.mockResolvedValue({
      schoolId: "school-1",
      departmentId: "department-1",
      school: { id: "school-1", name: "Example University", status: "APPROVED" },
      department: { id: "department-1", name: "Computing", status: "APPROVED" },
    });
    prismaMock.bankAccount.findUnique.mockResolvedValue({
      bankName: "Example Bank",
      accountName: "Ada Example",
      accountNumber: "******1234",
    });
    prismaMock.commissionAcceptance.findUnique.mockResolvedValue({
      acceptedAt: new Date(),
    });
    prismaMock.studentVerification.findFirst.mockResolvedValue({
      id: "verification-1",
      status: "APPROVED",
      fullName: "Ada Example",
      admissionNumber: "2020/12345",
      nickname: "Ada",
      submittedAt: new Date(),
    });
    prismaMock.ownerProfile.update.mockResolvedValue({});
    txMock.ownerProfile.updateMany.mockResolvedValue({ count: 1 });
    txMock.user.findUnique.mockResolvedValue(null);
    txMock.emailOutbox.upsert.mockResolvedValue({});
  });

  it("auto-approves the submitted identity details and completes onboarding", async () => {
    const result = await submitStudentVerification("user-1", {
      fullName: "Ada Example",
      admissionNumber: "2020/12345",
      nickname: "Ada",
    });

    expect(txMock.studentVerification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        fullName: "Ada Example",
        admissionNumber: "2020/12345",
        nickname: "Ada",
        status: "APPROVED",
        reviewedAt: expect.any(Date),
      }),
      select: expect.objectContaining({
        id: true,
        status: true,
        submittedAt: true,
      }),
    });
    expect(result.steps.studentVerification).toBe(true);
    expect(result.completed).toBe(true);
    expect(txMock.ownerProfile.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", onboardingCompletedAt: null },
      data: { onboardingCompletedAt: expect.any(Date) },
    });
  });
});
