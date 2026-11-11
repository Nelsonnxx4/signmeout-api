import { HttpError } from "../../lib/http-error.js";
import {
	PaystackError,
	listBanks,
	resolveAccount,
} from "../../integrations/paystack/paystack.client.js";
import { env } from "../../config/env.js";

export const BANK_OPTIONS = [
	{ code: "044", name: "Access Bank" },
	{ code: "050", name: "Ecobank Nigeria" },
	{ code: "070", name: "Fidelity Bank" },
	{ code: "011", name: "First Bank of Nigeria" },
	{ code: "214", name: "First City Monument Bank (FCMB)" },
	{ code: "058", name: "Guaranty Trust Bank (GTBank)" },
	{ code: "301", name: "Jaiz Bank" },
	{ code: "082", name: "Keystone Bank" },
	{ code: "303", name: "Lotus Bank" },
	{ code: "076", name: "Polaris Bank" },
	{ code: "105", name: "PremiumTrust Bank" },
	{ code: "101", name: "Providus Bank" },
	{ code: "221", name: "Stanbic IBTC Bank" },
	{ code: "068", name: "Standard Chartered Bank" },
	{ code: "232", name: "Sterling Bank" },
	{ code: "321", name: "TAJBank" },
	{ code: "032", name: "Union Bank" },
	{ code: "033", name: "United Bank for Africa (UBA)" },
	{ code: "215", name: "Unity Bank" },
	{ code: "035", name: "Wema Bank (ALAT)" },
	{ code: "057", name: "Zenith Bank" },
	{ code: "090551", name: "FairMoney Microfinance Bank" },
	{ code: "090267", name: "Kuda Microfinance Bank" },
	{ code: "50515", name: "Moniepoint Microfinance Bank" },
	{ code: "100004", name: "OPay" },
	{ code: "100033", name: "PalmPay" },
	{ code: "327", name: "Paga" },
	{ code: "090405", name: "Moniepoint MFB (NIP Identifier)" },
	{ code: "566", name: "VFD Microfinance Bank (VBank)" },
] as const;

const banksByCode = new Map(BANK_OPTIONS.map((bank) => [bank.code, bank]));

export async function getBanks() {
	if (!env.paystackSecretKey) return BANK_OPTIONS;
	try {
		const banks = await listBanks();
		return banks.map(({ code, name }) => ({ code, name }));
	} catch (error) {
		throw mapPaystackError(error);
	}
}

export async function getBankByCode(bankCode: string) {
	if (!env.paystackSecretKey) {
		return banksByCode.get(bankCode as (typeof BANK_OPTIONS)[number]["code"]);
	}
	const banks = await getBanks();
	return banks.find((bank) => bank.code === bankCode);
}

export async function resolveBankAccount(
	accountNumber: string,
	bankCode: string,
) {
	try {
		return await resolveAccount(accountNumber, bankCode);
	} catch (err) {
		throw mapPaystackError(err);
	}
}

export function mapPaystackError(err: unknown): unknown {
	if (!(err instanceof PaystackError)) return err;
	if (err.status === 400 || err.status === 422 || err.status === 404) {
		return new HttpError(
			422,
			"ACCOUNT_NOT_RESOLVED",
			"We couldn't verify that account. Check the bank and account number.",
		);
	}
	return new HttpError(
		502,
		"PAYMENT_PROVIDER_UNAVAILABLE",
		"Bank verification is temporarily unavailable. Try again shortly.",
	);
}
