import { env } from "../config/env.js";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  idempotencyKey?: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

export class ConsoleEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<void> {
    console.info(
      `\n--- EMAIL to ${message.to} ---\n${message.subject}\n${message.text}\n`,
    );
  }
}

export class ResendEmailProvider implements EmailProvider {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...(message.idempotencyKey
          ? { "Idempotency-Key": message.idempotencyKey }
          : {}),
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Resend email delivery failed with HTTP ${response.status}.`);
    }
  }
}

if (env.nodeEnv === "production" && (!env.resendApiKey || !env.emailFrom)) {
  throw new Error("RESEND_API_KEY and EMAIL_FROM are required in production.");
}

export const emailProvider: EmailProvider =
  env.nodeEnv === "production"
    ? new ResendEmailProvider(env.resendApiKey!, env.emailFrom!)
    : new ConsoleEmailProvider();
