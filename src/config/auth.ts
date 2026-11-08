import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./database.js";
import { env } from "./env.js";
import { emailProvider } from "../integrations/email.provider.js";

const isProd = env.nodeEnv === "production";

/** Fire-and-forget so response timing can't reveal whether an email exists. */
function sendInBackground(to: string, subject: string, text: string) {
  void emailProvider.send({ to, subject, text }).catch((err) => {
    console.error("Email send failed", { subject, err });
  });
}

export const auth = betterAuth({
  appName: "SignMeOut",
  baseURL: env.betterAuthUrl,
  basePath: "/api/v1/auth",
  secret: env.betterAuthSecret,
  trustedOrigins: [env.frontendUrl],

  database: prismaAdapter(prisma, { provider: "postgresql" }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    requireEmailVerification: true,
    resetPasswordTokenExpiresIn: 60 * 60, // 1 hour
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      sendInBackground(
        user.email,
        "Reset your SignMeOut password",
        `Hi ${user.name},\n\nReset your password (link valid for 1 hour):\n${url}\n\nIf you didn't request this, ignore this email.`,
      );
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      sendInBackground(
        user.email,
        "Verify your SignMeOut email",
        `Hi ${user.name},\n\nConfirm your email to finish creating your account:\n${url}`,
      );
    },
  },

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
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 60, max: 3 },
      "/send-verification-email": { window: 60, max: 3 },
    },
  },

  advanced: {
    useSecureCookies: isProd,
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure: isProd },
  },
});

export type Auth = typeof auth;