import { Router } from "express";

export const healthRouter = Router();

healthRouter.get("/", (_request, response) => {
  response.status(200).json({
    success: true,
    data: {
      service: "signmeout-api",
      status: "ok",
      timestamp: new Date().toISOString(),
    },
    requestId: response.locals.requestId,
  });
});

