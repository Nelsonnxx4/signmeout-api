import { describe, expect, it } from "vitest";

import { BANK_OPTIONS, getBankByCode, getBanks } from "../../src/modules/banks/bank.service.js";

describe("configured bank options", () => {
	it("returns the configured frontend bank catalog in order", async () => {
		await expect(getBanks()).resolves.toEqual(BANK_OPTIONS);
		expect(BANK_OPTIONS).toHaveLength(29);
	});

	it("looks up the configured Paystack code for payout validation", () => {
		expect(getBankByCode("044")).toEqual({
			code: "044",
			name: "Access Bank",
		});
		expect(getBankByCode("100033")).toEqual({
			code: "100033",
			name: "PalmPay",
		});
		expect(getBankByCode("not-a-bank")).toBeUndefined();
	});
});
