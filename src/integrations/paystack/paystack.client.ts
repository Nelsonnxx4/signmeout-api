import { env } from "../../config/env.js";

const BASE_URL = "https://api.paystack.co";
const TIMEOUT_MS = 10_000;

export class PaystackError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

interface Envelope<T> {
  status: boolean;
  message: string;
  data: T;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<Envelope<T>> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${env.paystackSecretKey ?? ""}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new PaystackError("Could not reach Paystack.", 503);
  }

  const body = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !body?.status) {
    throw new PaystackError(body?.message ?? "Paystack request failed.", res.status || 502);
  }

  return body;
}

export async function resolveAccount(accountNumber: string, bankCode: string) {
  const qs = new URLSearchParams({
    account_number: accountNumber,
    bank_code: bankCode,
  });

  const res = await request<{ account_number: string; account_name: string }>(`/bank/resolve?${qs}`);

  return {
    accountNumber: res.data.account_number,
    accountName: res.data.account_name,
  };
}

export async function createTransferRecipient(input: {
  name: string;
  accountNumber: string;
  bankCode: string;
}) {
  const res = await request<{ recipient_code: string }>("/transferrecipient", {
    method: "POST",
    body: JSON.stringify({
      type: "nuban",
      name: input.name,
      account_number: input.accountNumber,
      bank_code: input.bankCode,
      currency: "NGN",
    }),
  });

  return res.data.recipient_code;
}

export interface PaystackTransfer {
  reference: string;
  status: string;
  transfer_code?: string;
  amount?: number;
  currency?: string;
  recipient?: { recipient_code?: string };
}

export async function initiateTransfer(input: {
  amount: number;
  recipientCode: string;
  reference: string;
  reason: string;
}) {
  const res = await request<PaystackTransfer>("/transfer", {
    method: "POST",
    body: JSON.stringify({
      source: "balance",
      amount: input.amount,
      recipient: input.recipientCode,
      reference: input.reference,
      reason: input.reason,
    }),
  });
  return res.data;
}

export async function verifyTransfer(reference: string) {
  const res = await request<PaystackTransfer>(
    `/transfer/verify/${encodeURIComponent(reference)}`,
  );
  return res.data;
}

export async function verifyTransaction(reference: string) {
  const res = await request<{
    reference: string;
    status: string;
    amount: number;
    currency: string;
    id?: number | string;
    fees?: number;
  }>(`/transaction/verify/${encodeURIComponent(reference)}`);
  return res.data;
}

export async function initializeTransaction(input: {
  email: string;
  amount: number;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}) {
  const res = await request<{ authorization_url: string; reference: string }>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      amount: input.amount,
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: input.metadata,
    }),
  });

  return {
    authorization_url: res.data.authorization_url,
    reference: res.data.reference,
  };
}

export async function createRefund(input: {
  transaction: string;
  amount: number;
  reference: string;
  reason: string;
}) {
  const res = await request<{
    id: number;
    reference?: string;
    status: string;
    amount: number;
    currency: string;
  }>("/refund", {
    method: "POST",
    body: JSON.stringify({
      transaction: input.transaction,
      amount: input.amount,
      currency: "NGN",
      reference: input.reference,
      customer_note: input.reason,
      merchant_note: input.reason,
    }),
  });
  return res.data;
}
