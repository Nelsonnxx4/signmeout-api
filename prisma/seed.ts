import { PrismaClient } from "@prisma/client";

import {
  COMMISSION_POLICY_VERSION,
  OWNER_ALLOCATION_BASIS_POINTS,
  PLATFORM_COMMISSION_BASIS_POINTS,
} from "../src/modules/payments/payment.constants.js";

const prisma = new PrismaClient();

const seed = async () => {
  await prisma.commissionPolicy.upsert({
    where: { version: COMMISSION_POLICY_VERSION },
    update: {
      platformBasisPoints: PLATFORM_COMMISSION_BASIS_POINTS,
      ownerBasisPoints: OWNER_ALLOCATION_BASIS_POINTS,
    },
    create: {
      version: COMMISSION_POLICY_VERSION,
      platformBasisPoints: PLATFORM_COMMISSION_BASIS_POINTS,
      ownerBasisPoints: OWNER_ALLOCATION_BASIS_POINTS,
      effectiveAt: new Date("2026-11-08T00:00:00.000Z"),
    },
  });
};

seed()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });

