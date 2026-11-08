import pino from "pino";

import { env } from "./env.js";

export const logger = pino({
  level: env.logLevel,
  enabled: env.nodeEnv !== "test",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers.set-cookie",
      "password",
      "token",
      "secret",
      "accountNumber",
      "documentUrl",
    ],
    censor: "[REDACTED]",
  },
  base: {
    service: "signmeout-api",
    environment: env.nodeEnv,
  },
});

