import { createServer } from "node:http";

import { app } from "./app.js";
import { prisma } from "./config/database.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { startWithdrawalAlertWorker, stopWithdrawalAlertWorker } from "./modules/withdrawals/withdrawal-alerts.js";
import { startWithdrawalPayoutWorker, stopWithdrawalPayoutWorker } from "./modules/withdrawals/withdrawal-payout.worker.js";
import { startPaymentReconciliationWorker, stopPaymentReconciliationWorker } from "./modules/payments/payment-reconciliation.worker.js";
import { startEmailOutboxWorker, stopEmailOutboxWorker } from "./modules/notifications/email-outbox.worker.js";

const startServer = async () => {
  await prisma.$connect();
  startWithdrawalAlertWorker();
  startWithdrawalPayoutWorker();
  startPaymentReconciliationWorker();
  startEmailOutboxWorker();

  const server = createServer(app);

  server.listen(env.port, () => {
    logger.info({ port: env.port }, "SignMeOut API is listening");
  });

  const shutdown = async (signal: NodeJS.Signals) => {
    logger.info({ signal }, "Shutting down SignMeOut API");
    stopWithdrawalAlertWorker();
    stopWithdrawalPayoutWorker();
    stopPaymentReconciliationWorker();
    stopEmailOutboxWorker();

    server.close(async (error) => {
      await prisma.$disconnect();

      if (error) {
        logger.error({ error }, "HTTP server failed to close cleanly");
        process.exitCode = 1;
        return;
      }

      process.exitCode = 0;
    });
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
};

startServer().catch((error: unknown) => {
  logger.fatal({ error }, "SignMeOut API failed to start");
  process.exitCode = 1;
});
