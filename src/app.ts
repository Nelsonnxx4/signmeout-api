import cors from "cors";
import express, { type Request } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { pinoHttp } from "pino-http";

import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFound } from "./middleware/not-found.js";
import { requestContext } from "./middleware/request-context.js";
import { v1Router } from "./routes/v1.js";

export const createApp = () => {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(requestContext);
  app.use(
    pinoHttp({
      logger,
      genReqId: (request) => (request as Request).id,
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      origin: env.frontendUrl,
      credentials: true,
    }),
  );
  app.use(
    "/api/v1/webhooks/paystack",
    express.raw({ type: "application/json", limit: "1mb" }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));

  app.use(
    "/api/v1",
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
    v1Router,
  );

  app.use(notFound);
  app.use(errorHandler);

  return app;
};

export const app = createApp();
