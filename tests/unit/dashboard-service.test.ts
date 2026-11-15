import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, getWithdrawalSummaryMock } = vi.hoisted(() => ({
  prismaMock: {
    payment: { aggregate: vi.fn(), findMany: vi.fn() },
    signature: { count: vi.fn(), findMany: vi.fn() },
    withdrawal: { findMany: vi.fn() },
    studentVerification: { findFirst: vi.fn() },
  },
  getWithdrawalSummaryMock: vi.fn(),
}));

vi.mock("../../src/config/database.js", () => ({ prisma: prismaMock }));
vi.mock("../../src/modules/withdrawals/withdrawal.service.js", () => ({
  getWithdrawalSummary: getWithdrawalSummaryMock,
}));

import { getDashboardSummary } from "../../src/modules/dashboard/dashboard.service.js";

describe("getDashboardSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.payment.aggregate.mockResolvedValue({
      _count: { _all: 1 },
      _sum: { grossAmountKobo: 200_000, ownerAmountKobo: 170_000 },
    });
    prismaMock.signature.count.mockResolvedValue(1);
    prismaMock.payment.findMany.mockResolvedValue([]);
    prismaMock.signature.findMany.mockResolvedValue([
      {
        id: "signature-1",
        assetKey: "signatures/signature-1.png",
        surfaceId: "front",
        uvX: 0.5,
        uvY: 0.5,
        width: 0.1,
        height: 0.1,
        rotation: 0,
        scale: 1,
        submittedAt: new Date("2026-11-15T12:00:00.000Z"),
        payment: { contributorName: "Ada Lovelace" },
        shirt: { slug: "ada-shirt", shirtType: "SHORT_SLEEVE" },
      },
    ]);
    prismaMock.withdrawal.findMany.mockResolvedValue([]);
    prismaMock.studentVerification.findFirst.mockResolvedValue(null);
    getWithdrawalSummaryMock.mockResolvedValue({ availableBalance: 170_000 });
  });

  it("shows a contributor name in the authenticated owner's recent signatures", async () => {
    const summary = await getDashboardSummary("owner-1");

    expect(prismaMock.signature.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shirt: { ownerId: "owner-1" } },
        select: expect.objectContaining({
          payment: { select: { contributorName: true } },
        }),
      }),
    );
    expect(summary.recentSignatures[0]).toEqual(
      expect.objectContaining({
        id: "signature-1",
        contributorName: "Ada Lovelace",
      }),
    );
    expect(summary.recentSignatures[0]).not.toHaveProperty("payment");
  });
});
