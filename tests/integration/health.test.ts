import request from "supertest";
import { describe, expect, it } from "vitest";

import { app } from "../../src/app.js";

describe("GET /api/v1/health", () => {
  it("returns the service status and a request ID", async () => {
    const response = await request(app).get("/api/v1/health").expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      service: "signmeout-api",
      status: "ok",
    });
    expect(response.headers["x-request-id"]).toBe(response.body.requestId);
  });
});

describe("unknown routes", () => {
  it("returns the standard error envelope", async () => {
    const response = await request(app).get("/api/v1/missing").expect(404);

    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: "ROUTE_NOT_FOUND",
      },
    });
    expect(response.body.requestId).toBeTruthy();
  });
});

