import { createHmac } from "node:crypto";

import { prisma } from "../../config/database.js";
import { env } from "../../config/env.js";
import { emailProvider } from "../../integrations/email.provider.js";
import { logger } from "../../config/logger.js";

const BATCH_SIZE = 3;
const POLL_INTERVAL_MS = 5_000;
const LOCK_DURATION_MS = 60_000;
const MAX_RETRY_DELAY_MS = 15 * 60_000;

function retryDelay(attempts: number) {
  return Math.min(15_000 * 2 ** Math.max(0, attempts - 1), MAX_RETRY_DELAY_MS);
}

function formatNaira(amountKobo: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
  }).format(amountKobo / 100);
}

async function sendWebhook(payload: Record<string, unknown>, eventId: string) {
  const url = env.adminAlertWebhookUrl;
  const secret = env.adminAlertWebhookSecret;
  if (!url || !secret) throw new Error("Admin webhook alert is not configured.");

  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": eventId,
      "X-SignMeOut-Timestamp": timestamp,
      "X-SignMeOut-Signature": `sha256=${signature}`,
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Admin webhook delivery failed with HTTP ${response.status}.`);
  }
}

export async function processPendingWithdrawalAlerts() {
  if (
    !env.adminAlertEmail ||
    !env.adminAlertWebhookUrl ||
    !env.adminAlertWebhookSecret
  ) {
    return;
  }

  const now = new Date();
  const alerts = await prisma.withdrawalAlert.findMany({
    where: {
      withdrawal: { is: { status: "PENDING" } },
      nextAttemptAt: { lte: now },
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
      AND: [{ OR: [{ emailSentAt: null }, { webhookSentAt: null }] }],
    },
    include: {
      withdrawal: {
        include: {
          ownerProfile: {
            include: { user: { select: { name: true, email: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
  });

  for (const alert of alerts) {
    const claimed = await prisma.withdrawalAlert.updateMany({
      where: {
        id: alert.id,
        withdrawal: { is: { status: "PENDING" } },
        nextAttemptAt: { lte: now },
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
      },
      data: { lockedUntil: new Date(Date.now() + LOCK_DURATION_MS) },
    });
    if (claimed.count !== 1) continue;

    const { withdrawal } = alert;
    const user = withdrawal.ownerProfile.user;
    const payload = {
      id: alert.id,
      event: "withdrawal.requested",
      requestedAt: withdrawal.requestedAt.toISOString(),
      adminResponseDeadline: withdrawal.adminResponseDeadline.toISOString(),
      withdrawal: {
        id: withdrawal.id,
        amountKobo: withdrawal.amountKobo,
        amountNaira: withdrawal.amountKobo / 100,
        status: withdrawal.status,
      },
      contributor: { name: user.name, email: user.email },
      payoutAccount: {
        bankName: withdrawal.bankName,
        bankCode: withdrawal.bankCode,
        accountName: withdrawal.accountName,
        accountNumber: withdrawal.accountNumber,
      },
    };

    let emailAttempts = alert.emailAttempts;
    let webhookAttempts = alert.webhookAttempts;
    let nextAttemptDelay = MAX_RETRY_DELAY_MS;

    if (!alert.emailSentAt) {
      emailAttempts += 1;
      try {
        await emailProvider.send({
          to: env.adminAlertEmail,
          idempotencyKey: alert.id,
          subject: `Withdrawal request needs review: ${formatNaira(withdrawal.amountKobo)}`,
          text: [
            "A contributor requested a withdrawal.",
            "",
            `Contributor: ${user.name} (${user.email})`,
            `Amount: ${formatNaira(withdrawal.amountKobo)} (${withdrawal.amountKobo} kobo)`,
            `Bank: ${withdrawal.bankName} (${withdrawal.bankCode})`,
            `Account name: ${withdrawal.accountName}`,
            `Account number: ${withdrawal.accountNumber}`,
            `Requested: ${withdrawal.requestedAt.toISOString()}`,
            `Admin response deadline: ${withdrawal.adminResponseDeadline.toISOString()}`,
            `Withdrawal ID: ${withdrawal.id}`,
          ].join("\n"),
        });
        await prisma.withdrawalAlert.update({
          where: { id: alert.id },
          data: { emailSentAt: new Date(), emailAttempts, emailLastError: null },
        });
      } catch (error) {
        nextAttemptDelay = Math.min(nextAttemptDelay, retryDelay(emailAttempts));
        await prisma.withdrawalAlert.update({
          where: { id: alert.id },
          data: {
            emailAttempts,
            emailLastError: error instanceof Error ? error.message : "Email delivery failed.",
          },
        });
        logger.error({ error, alertId: alert.id }, "Withdrawal admin email alert failed");
      }
    }

    if (!alert.webhookSentAt) {
      webhookAttempts += 1;
      try {
        await sendWebhook(payload, alert.id);
        await prisma.withdrawalAlert.update({
          where: { id: alert.id },
          data: { webhookSentAt: new Date(), webhookAttempts, webhookLastError: null },
        });
      } catch (error) {
        nextAttemptDelay = Math.min(nextAttemptDelay, retryDelay(webhookAttempts));
        await prisma.withdrawalAlert.update({
          where: { id: alert.id },
          data: {
            webhookAttempts,
            webhookLastError: error instanceof Error ? error.message : "Webhook delivery failed.",
          },
        });
        logger.error({ error, alertId: alert.id }, "Withdrawal admin webhook alert failed");
      }
    }

    await prisma.withdrawalAlert.update({
      where: { id: alert.id },
      data: {
        lockedUntil: null,
        nextAttemptAt: new Date(Date.now() + nextAttemptDelay),
      },
    });
  }
}

let worker: NodeJS.Timeout | undefined;

export function startWithdrawalAlertWorker() {
  if (worker) return;
  const run = () => {
    void processPendingWithdrawalAlerts().catch((error: unknown) => {
      logger.error({ error }, "Withdrawal alert worker failed");
    });
  };
  run();
  worker = setInterval(run, POLL_INTERVAL_MS);
  worker.unref();
}

export function stopWithdrawalAlertWorker() {
  if (worker) clearInterval(worker);
  worker = undefined;
}
