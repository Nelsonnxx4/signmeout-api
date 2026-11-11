import { logger } from "../../config/logger.js";
import { processDuePaymentReconciliations } from "./payment.service.js";

const POLL_INTERVAL_MS = 30_000;
let worker: NodeJS.Timeout | undefined;

export function startPaymentReconciliationWorker() {
  if (worker) return;
  const run = () => {
    void processDuePaymentReconciliations().catch((error: unknown) => {
      logger.error({ error }, "Payment reconciliation worker failed");
    });
  };
  run();
  worker = setInterval(run, POLL_INTERVAL_MS);
  worker.unref();
}

export function stopPaymentReconciliationWorker() {
  if (worker) clearInterval(worker);
  worker = undefined;
}
