import { describe, expect, it } from "vitest";

import { walletTransactionsQuerySchema } from "../../src/modules/dashboard/dashboard.schema.js";

describe("walletTransactionsQuerySchema", () => {
  it("defaults to the first page with 20 transactions", () => {
    expect(walletTransactionsQuerySchema.parse({})).toEqual({ limit: 20 });
  });

  it("accepts a bounded page size and UUID cursor", () => {
    expect(
      walletTransactionsQuerySchema.parse({
        limit: "50",
        cursor: "d2719b76-7bf1-4f4a-b9b4-df6c2215e281",
      }),
    ).toEqual({
      limit: 50,
      cursor: "d2719b76-7bf1-4f4a-b9b4-df6c2215e281",
    });
  });

  it("rejects invalid cursors and unbounded page sizes", () => {
    expect(() => walletTransactionsQuerySchema.parse({ cursor: "bad" })).toThrow();
    expect(() => walletTransactionsQuerySchema.parse({ limit: "101" })).toThrow();
  });
});
