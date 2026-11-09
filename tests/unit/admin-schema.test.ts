import { describe, expect, it } from "vitest";

import {
  adminListQuerySchema,
  adminPaymentQuerySchema,
} from "../../src/modules/admin/admin.schema.js";

describe("admin query schemas", () => {
  it("applies bounded pagination defaults", () => {
    expect(adminListQuerySchema.parse({})).toEqual({ limit: 20 });
  });

  it("supports payment status filters", () => {
    expect(adminPaymentQuerySchema.parse({ status: "PAID", limit: "25" })).toEqual({
      status: "PAID",
      limit: 25,
    });
  });

  it("rejects malformed cursors and unsupported statuses", () => {
    expect(() => adminListQuerySchema.parse({ cursor: "invalid" })).toThrow();
    expect(() => adminPaymentQuerySchema.parse({ status: "UNKNOWN" })).toThrow();
  });
});
