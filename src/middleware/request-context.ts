import { randomUUID } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

export const requestContext = (
  request: Request,
  response: Response,
  next: NextFunction,
) => {
  const suppliedRequestId = request.header("x-request-id")?.trim();
  const requestId = suppliedRequestId || randomUUID();

  request.id = requestId;
  response.locals.requestId = requestId;
  response.setHeader("x-request-id", requestId);

  next();
};

