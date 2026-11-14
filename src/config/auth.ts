import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { emailOTP } from "better-auth/plugins";
import { prisma } from "./database.js";
import { env } from "./env.js";
import { logger } from "./logger.js";
import { emailProvider } from "../integrations/email.provider.js";

const isProd = env.nodeEnv === "production";

export const auth = betterAuth({
	appName: "SignMeOut",
	baseURL: env.betterAuthUrl,
	basePath: "/api/v1/auth",
	secret: env.betterAuthSecret,
	trustedOrigins: [env.frontendUrl, "https://dash.better-auth.com"],

	database: prismaAdapter(prisma, { provider: "postgresql" }),

	emailAndPassword: { enabled: false },

	socialProviders:
		env.googleClientId && env.googleClientSecret
			? {
					google: {
						clientId: env.googleClientId,
						clientSecret: env.googleClientSecret,
					},
				}
			: {},

	user: {
		additionalFields: {
			role: { type: "string", defaultValue: "OWNER", input: false },
		},
	},

	session: {
		expiresIn: 60 * 60 * 24 * 7,
		updateAge: 60 * 60 * 24,
		cookieCache: { enabled: false },
	},

	rateLimit: {
		enabled: true,
		window: 60,
		max: 100,
		customRules: {
			"/email-otp/send-verification-otp": { window: 60, max: 3 },
			"/sign-in/email-otp": { window: 60, max: 5 },
		},
	},

	onAPIError: {
		errorURL: env.frontendUrl,
		onError: (error) => {
			logger.error({ err: error }, "Better Auth API request failed");
		},
	},

	plugins: [
		emailOTP({
			otpLength: 6,
			expiresIn: 300,
			allowedAttempts: 5,
			storeOTP: "hashed",
			disableSignUp: false,
			overrideDefaultEmailVerification: true,
			rateLimit: { window: 60, max: 3 },
			sendVerificationOTP: async ({ email, otp }) => {
				await emailProvider.send({
					to: email,
					subject: "Your SignMeOut sign-in code",
					text: `Your SignMeOut verification code is ${otp}. It expires in 5 minutes. If you did not request this code, you can ignore this email.`,
				});
			},
		}),
	],

	advanced: {
		useSecureCookies: isProd,
		database: {
			generateId: "uuid",
		},
		defaultCookieAttributes: {
			httpOnly: true,
			sameSite: isProd ? "none" : "lax",
			secure: isProd,
		},
	},
});

export type Auth = typeof auth;
