import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { errorHandler } from "../../src/middleware/error-handler.js";
import { HttpError, parseOrThrow } from "../../src/lib/http-error.js";

describe("errorHandler", () => {
  it("preserves HttpError status, code, details, and request ID", () => {
    const response = {
      locals: { requestId: "request-123" },
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    errorHandler(
      new HttpError(409, "PAYMENT_CONFLICT", "Payment conflict.", { reference: "ref-1" }),
      { id: "request-123", method: "POST", originalUrl: "/payments" } as never,
      response as never,
      vi.fn(),
    );

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: "PAYMENT_CONFLICT",
        message: "Payment conflict.",
        details: { reference: "ref-1" },
      },
      requestId: "request-123",
    });
  });

  it("does not echo invalid request values in validation details", () => {
    try {
      parseOrThrow(z.object({ accountNumber: z.string().regex(/^\d{10}$/) }), {
        accountNumber: "123",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      if (!(error instanceof HttpError)) throw error;

      expect(error.details).toEqual([
        expect.objectContaining({ path: ["accountNumber"] }),
      ]);
      expect(JSON.stringify(error.details)).not.toContain("123");
      return;
    }

    throw new Error("Expected invalid data to throw.");
  });
});
