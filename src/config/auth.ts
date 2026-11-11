import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { emailOTP } from "better-auth/plugins";
import { dash } from "@better-auth/infra";
import { prisma } from "./database.js";
import { env } from "./env.js";
import { emailProvider } from "../integrations/email.provider.js";

const isProd = env.nodeEnv === "production";

export const auth = betterAuth({
  appName: "SignMeOut",
  baseURL: env.betterAuthUrl,
  basePath: "/api/v1/auth",
  secret: env.betterAuthSecret,
  trustedOrigins: [env.frontendUrl],

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
      // Not settable from the client. Promote admins directly in the database.
      role: { type: "string", defaultValue: "OWNER", input: false },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh daily
    cookieCache: { enabled: false }, // revocation takes effect immediately
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
    ...(isProd && env.betterAuthApiKey
      ? [dash({ apiKey: env.betterAuthApiKey })]
      : []),
  ],

  advanced: {
    useSecureCookies: isProd,
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure: isProd },
  },
});

export type Auth = typeof auth;
