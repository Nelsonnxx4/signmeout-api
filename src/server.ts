import { createServer } from "node:http";

import { app } from "./app.js";
import { prisma } from "./config/database.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";

const startServer = async () => {
  await prisma.$connect();

  const server = createServer(app);

  server.listen(env.port, () => {
    logger.info({ port: env.port }, "SignMeOut API is listening");
  });

  const shutdown = async (signal: NodeJS.Signals) => {
    logger.info({ signal }, "Shutting down SignMeOut API");

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

