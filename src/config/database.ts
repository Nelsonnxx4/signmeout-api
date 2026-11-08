import { PrismaClient } from "@prisma/client";

import { env } from "./env.js";

const createPrismaClient = () =>
  new PrismaClient({
    log:
      env.nodeEnv === "development"
        ? ["warn", "error"]
        : ["error"],
  });

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (env.nodeEnv !== "production") {
  globalForPrisma.prisma = prisma;
}

