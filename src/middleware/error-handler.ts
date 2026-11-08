import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { ApiError } from "../lib/api-error.js";
import { HttpError } from "../lib/http-error.js";

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  request,
  response,
  _next,
) => {
  if (error instanceof ZodError) {
    response.status(422).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "The request contains invalid data",
        details: error.issues,
      },
      requestId: response.locals.requestId,
    });
    return;
  }

  if (error instanceof ApiError) {
    response.status(error.statusCode).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
      requestId: response.locals.requestId,
    });
    return;
  }

  logger.error(
    {
      error,
      requestId: request.id,
      method: request.method,
      path: request.originalUrl,
    },
    "Unhandled request error",
  );

  response.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message:
        env.nodeEnv === "production"
          ? "An unexpected error occurred"
          : error instanceof Error
            ? error.message
            : "An unexpected error occurred",
    },
    requestId: response.locals.requestId,
  });
};

