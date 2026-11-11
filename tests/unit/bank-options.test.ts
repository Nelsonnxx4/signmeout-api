import { describe, expect, it } from "vitest";

import { vi } from "vitest";

vi.mock("../../src/config/env.js", () => ({
  env: { nodeEnv: "test", paystackSecretKey: undefined },
}));

import { BANK_OPTIONS, getBankByCode, getBanks } from "../../src/modules/banks/bank.service.js";

describe("configured bank options", () => {
	it("returns the configured frontend bank catalog in order", async () => {
		await expect(getBanks()).resolves.toEqual(BANK_OPTIONS);
		expect(BANK_OPTIONS).toHaveLength(29);
	});

	it("looks up the configured Paystack code for payout validation", async () => {
		await expect(getBankByCode("044")).resolves.toEqual({
			code: "044",
			name: "Access Bank",
		});
		await expect(getBankByCode("100033")).resolves.toEqual({
			code: "100033",
			name: "PalmPay",
		});
		await expect(getBankByCode("not-a-bank")).resolves.toBeUndefined();
	});
});
