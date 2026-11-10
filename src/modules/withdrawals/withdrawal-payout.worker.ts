import { logger } from "../../config/logger.js";
import { processDueWithdrawalPayouts } from "./withdrawal.service.js";

const POLL_INTERVAL_MS = 5_000;

let worker: NodeJS.Timeout | undefined;

export function startWithdrawalPayoutWorker() {
  if (worker) return;
  const run = () => {
    void processDueWithdrawalPayouts().catch((error: unknown) => {
      logger.error({ error }, "Automatic withdrawal payout worker failed");
    });
  };
  run();
  worker = setInterval(run, POLL_INTERVAL_MS);
  worker.unref();
}

export function stopWithdrawalPayoutWorker() {
  if (worker) clearInterval(worker);
  worker = undefined;
}
