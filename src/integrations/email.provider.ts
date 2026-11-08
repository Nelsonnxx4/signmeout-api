export interface EmailMessage {
	to: string;
	subject: string;
	text: string;
	html?: string;
}

/** Swap implementations (Resend, Postmark, SES...) without touching auth code. */
export interface EmailProvider {
	send(message: EmailMessage): Promise<void>;
}

/** Dev-only provider: prints the email so you can click verification/reset links. */
export class ConsoleEmailProvider implements EmailProvider {
	async send(message: EmailMessage): Promise<void> {
		console.info(
			`\n--- EMAIL to ${message.to} ---\n${message.subject}\n${message.text}\n`,
		);
	}
}

class UnconfiguredEmailProvider implements EmailProvider {
	async send(): Promise<void> {
		throw new Error(
			"No email provider configured. Implement EmailProvider and register it in email.provider.ts.",
		);
	}
}

export const emailProvider: EmailProvider =
	process.env.NODE_ENV === "production"
		? new UnconfiguredEmailProvider()
		: new ConsoleEmailProvider();
