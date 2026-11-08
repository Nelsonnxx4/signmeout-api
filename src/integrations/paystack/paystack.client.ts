import { env } from "../../config/env.js";

const BASE_URL = "https://api.paystack.co";
const TIMEOUT_MS = 10_000;
const BANK_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export class PaystackError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

export interface PaystackBank {
  name: string;
  code: string;
  slug: string;
  active: boolean;
  type: string;
}

interface Envelope<T> {
  status: boolean;
  message: string;
  data: T;
  meta?: { next?: string | null };
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

let bankCache: { banks: PaystackBank[]; expires: number } | null = null;
let inflight: Promise<PaystackBank[]> | null = null;

async function fetchAllBanks(): Promise<PaystackBank[]> {
  const all: PaystackBank[] = [];
  let next: string | null | undefined;

  do {
    const qs = new URLSearchParams({
      country: "nigeria",
      currency: "NGN",
      perPage: "100",
      use_cursor: "true",
    });

    if (next) qs.set("next", next);

    const page = await request<PaystackBank[]>(`/bank?${qs}`);
    all.push(...page.data);
    next = page.meta?.next;
  } while (next);

  return all.filter((b) => b.active).sort((a, b) => a.name.localeCompare(b.name));
}

export async function listBanks(): Promise<PaystackBank[]> {
  if (bankCache && bankCache.expires > Date.now()) return bankCache.banks;

  inflight ??= fetchAllBanks()
    .then((banks) => {
      bankCache = { banks, expires: Date.now() + BANK_CACHE_TTL_MS };
      return banks;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function clearBankCache() {
  bankCache = null;
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
