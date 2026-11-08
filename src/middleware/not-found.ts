import type { NextFunction, Request, Response } from "express";

import { ApiError } from "../lib/api-error.js";

export const notFound = (
  request: Request,
  _response: Response,
  next: NextFunction,
) => {
  next(
    new ApiError(
      404,
      "ROUTE_NOT_FOUND",
      `Route ${request.method} ${request.originalUrl} was not found`,
    ),
  );
};

