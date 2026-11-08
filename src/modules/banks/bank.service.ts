import { HttpError } from "../../lib/http-error.js";
import {
	PaystackError,
	listBanks,
	resolveAccount,
} from "../../integrations/paystack/paystack.client.js";

export async function getBanks() {
	try {
		const banks = await listBanks();
		return banks.map((b) => ({ name: b.name, code: b.code }));
	} catch (err) {
		throw mapPaystackError(err);
	}
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
