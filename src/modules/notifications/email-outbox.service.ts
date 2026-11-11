import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/database.js";
import { logger } from "../../config/logger.js";
import { emailProvider } from "../../integrations/email.provider.js";

type OutboxClient = Pick<Prisma.TransactionClient, "emailOutbox">;

export async function enqueueEmail(
  client: OutboxClient,
  message: {
    eventType: string;
    recipient: string;
    subject: string;
    body: string;
    idempotencyKey: string;
  },
) {
  await client.emailOutbox.upsert({
    where: { idempotencyKey: message.idempotencyKey },
    update: {},
    create: message,
  });
}

export async function processEmailOutbox() {
  const now = new Date();
  const jobs = await prisma.emailOutbox.findMany({
    where: {
      sentAt: null,
      nextAttemptAt: { lte: now },
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
    },
    orderBy: { createdAt: "asc" },
    take: 20,
    select: { id: true },
  });

  for (const candidate of jobs) {
    const lockedUntil = new Date(Date.now() + 60_000);
    const claimed = await prisma.emailOutbox.updateMany({
      where: {
        id: candidate.id,
        sentAt: null,
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
      },
      data: { lockedUntil, attempts: { increment: 1 } },
    });
    if (claimed.count !== 1) continue;

    const job = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: candidate.id } });
    try {
      await emailProvider.send({
        to: job.recipient,
        subject: job.subject,
        text: job.body,
        idempotencyKey: job.idempotencyKey,
      });
      await prisma.emailOutbox.update({
        where: { id: job.id },
        data: { sentAt: new Date(), lockedUntil: null, lastError: null },
      });
    } catch (error) {
      const delayMs = Math.min(30_000 * 2 ** Math.min(job.attempts, 8), 6 * 60 * 60_000);
      await prisma.emailOutbox.update({
        where: { id: job.id },
        data: {
          lockedUntil: null,
          nextAttemptAt: new Date(Date.now() + delayMs),
          lastError: error instanceof Error ? error.message.slice(0, 2_000) : "Unknown email error",
        },
      });
      logger.error({ error, emailOutboxId: job.id }, "Email outbox delivery failed");
    }
  }
}
