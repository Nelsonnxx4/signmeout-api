import { logger } from "../../config/logger.js";
import { processEmailOutbox } from "./email-outbox.service.js";

const POLL_INTERVAL_MS = 10_000;
let worker: NodeJS.Timeout | undefined;

export function startEmailOutboxWorker() {
  if (worker) return;
  const run = () => {
    void processEmailOutbox().catch((error: unknown) => {
      logger.error({ error }, "Email outbox worker failed");
    });
  };
  run();
  worker = setInterval(run, POLL_INTERVAL_MS);
  worker.unref();
}

export function stopEmailOutboxWorker() {
  if (worker) clearInterval(worker);
  worker = undefined;
}
