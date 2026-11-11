import "dotenv/config";

import { z } from "zod";

const emptyStringToUndefined = (value: unknown) =>
  value === "" ? undefined : value;

const optionalString = z.preprocess(
  emptyStringToUndefined,
  z.string().trim().min(1).optional(),
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(5_000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  FRONTEND_URL: z.url().default("http://localhost:5173"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  BETTER_AUTH_SECRET: optionalString,
  BETTER_AUTH_URL: z.url().default("http://localhost:5000"),
  BETTER_AUTH_API_KEY: optionalString,
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  PAYSTACK_SECRET_KEY: optionalString,
  PAYSTACK_PUBLIC_KEY: optionalString,
  PAYSTACK_WEBHOOK_SECRET: optionalString,
  PAYSTACK_TRANSFERS_ENABLED: z.enum(["true", "false"]).default("false"),
  ADMIN_ALERT_EMAIL: z.preprocess(
    emptyStringToUndefined,
    z.string().email().optional(),
  ),
  ADMIN_ALERT_WEBHOOK_URL: z.preprocess(emptyStringToUndefined, z.url().optional()),
  ADMIN_ALERT_WEBHOOK_SECRET: optionalString,
  RESEND_API_KEY: optionalString,
  EMAIL_FROM: optionalString,
  SIGNING_TOKEN_SECRET: optionalString,
  R2_ACCOUNT_ID: optionalString,
  R2_ACCESS_KEY_ID: optionalString,
  R2_SECRET_ACCESS_KEY: optionalString,
  R2_BUCKET_NAME: optionalString,
}).superRefine((values, context) => {
  const hasGoogleClientId = Boolean(values.GOOGLE_CLIENT_ID);
  const hasGoogleClientSecret = Boolean(values.GOOGLE_CLIENT_SECRET);
  const r2Values = [
    values.R2_ACCOUNT_ID,
    values.R2_ACCESS_KEY_ID,
    values.R2_SECRET_ACCESS_KEY,
    values.R2_BUCKET_NAME,
  ];

  if (hasGoogleClientId !== hasGoogleClientSecret) {
    context.addIssue({
      code: "custom",
      path: ["GOOGLE_CLIENT_ID"],
      message: "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured together",
    });
  }

  if (values.NODE_ENV === "production") {
    if (!values.BETTER_AUTH_SECRET) {
      context.addIssue({
        code: "custom",
        path: ["BETTER_AUTH_SECRET"],
        message: "BETTER_AUTH_SECRET is required in production",
      });
    }

    if (!values.BETTER_AUTH_API_KEY) {
      context.addIssue({
        code: "custom",
        path: ["BETTER_AUTH_API_KEY"],
        message: "BETTER_AUTH_API_KEY is required in production",
      });
    }

    if (!hasGoogleClientId || !hasGoogleClientSecret) {
      context.addIssue({
        code: "custom",
        path: ["GOOGLE_CLIENT_ID"],
        message: "Google OAuth credentials are required in production",
      });
    }

    if (!values.SIGNING_TOKEN_SECRET) {
      context.addIssue({
        code: "custom",
        path: ["SIGNING_TOKEN_SECRET"],
        message: "SIGNING_TOKEN_SECRET is required in production",
      });
    }

    if (!r2Values.every(Boolean)) {
      context.addIssue({
        code: "custom",
        path: ["R2_BUCKET_NAME"],
        message: "Cloudflare R2 settings are required in production",
      });
    }

    if (!values.ADMIN_ALERT_EMAIL) {
      context.addIssue({
        code: "custom",
        path: ["ADMIN_ALERT_EMAIL"],
        message: "ADMIN_ALERT_EMAIL is required in production",
      });
    }

    if (
      !values.ADMIN_ALERT_WEBHOOK_URL ||
      !values.ADMIN_ALERT_WEBHOOK_SECRET ||
      values.ADMIN_ALERT_WEBHOOK_SECRET.length < 32
    ) {
      context.addIssue({
        code: "custom",
        path: ["ADMIN_ALERT_WEBHOOK_SECRET"],
        message: "Configure an HTTPS ADMIN_ALERT_WEBHOOK_URL and an ADMIN_ALERT_WEBHOOK_SECRET of at least 32 characters",
      });
    }

    if (!values.RESEND_API_KEY || !values.EMAIL_FROM) {
      context.addIssue({
        code: "custom",
        path: ["RESEND_API_KEY"],
        message: "RESEND_API_KEY and EMAIL_FROM are required in production",
      });
    }

    if (!values.PAYSTACK_SECRET_KEY) {
      context.addIssue({
        code: "custom",
        path: ["PAYSTACK_SECRET_KEY"],
        message: "PAYSTACK_SECRET_KEY is required in production",
      });
    }

    if (!values.PAYSTACK_WEBHOOK_SECRET) {
      context.addIssue({
        code: "custom",
        path: ["PAYSTACK_WEBHOOK_SECRET"],
        message: "PAYSTACK_WEBHOOK_SECRET is required in production",
      });
    }
  }

  if (
    values.NODE_ENV === "production" &&
    values.ADMIN_ALERT_WEBHOOK_URL &&
    new URL(values.ADMIN_ALERT_WEBHOOK_URL).protocol !== "https:"
  ) {
    context.addIssue({
      code: "custom",
      path: ["ADMIN_ALERT_WEBHOOK_URL"],
      message: "ADMIN_ALERT_WEBHOOK_URL must use HTTPS in production",
    });
  }

  if (
    values.PAYSTACK_TRANSFERS_ENABLED === "true" &&
    !values.PAYSTACK_SECRET_KEY
  ) {
    context.addIssue({
      code: "custom",
      path: ["PAYSTACK_SECRET_KEY"],
      message: "PAYSTACK_SECRET_KEY is required when transfers are enabled",
    });
  }

  if (r2Values.some(Boolean) && !r2Values.every(Boolean)) {
    context.addIssue({
      code: "custom",
      path: ["R2_BUCKET_NAME"],
      message: "All R2 storage settings must be configured together",
    });
  }
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const details = result.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");

  throw new Error(`Invalid environment configuration: ${details}`);
}

export const env = {
  nodeEnv: result.data.NODE_ENV,
  port: result.data.PORT,
  databaseUrl: result.data.DATABASE_URL,
  frontendUrl: result.data.FRONTEND_URL,
  logLevel: result.data.LOG_LEVEL,
  betterAuthSecret: result.data.BETTER_AUTH_SECRET,
  betterAuthUrl: result.data.BETTER_AUTH_URL,
  betterAuthApiKey: result.data.BETTER_AUTH_API_KEY,
  googleClientId: result.data.GOOGLE_CLIENT_ID,
  googleClientSecret: result.data.GOOGLE_CLIENT_SECRET,
  paystackSecretKey: result.data.PAYSTACK_SECRET_KEY,
  paystackPublicKey: result.data.PAYSTACK_PUBLIC_KEY,
  paystackWebhookSecret: result.data.PAYSTACK_WEBHOOK_SECRET,
  paystackTransfersEnabled: result.data.PAYSTACK_TRANSFERS_ENABLED === "true",
  adminAlertEmail: result.data.ADMIN_ALERT_EMAIL,
  adminAlertWebhookUrl: result.data.ADMIN_ALERT_WEBHOOK_URL,
  adminAlertWebhookSecret: result.data.ADMIN_ALERT_WEBHOOK_SECRET,
  resendApiKey: result.data.RESEND_API_KEY,
  emailFrom: result.data.EMAIL_FROM,
  signingTokenSecret: result.data.SIGNING_TOKEN_SECRET,
  r2AccountId: result.data.R2_ACCOUNT_ID,
  r2AccessKeyId: result.data.R2_ACCESS_KEY_ID,
  r2SecretAccessKey: result.data.R2_SECRET_ACCESS_KEY,
  r2BucketName: result.data.R2_BUCKET_NAME,
} as const;
