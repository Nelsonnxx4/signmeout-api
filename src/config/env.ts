import "dotenv/config";

import { z } from "zod";

const emptyStringToUndefined = (value: unknown) =>
  value === "" ? undefined : value;

const optionalString = z.preprocess(
  emptyStringToUndefined,
  z.string().min(1).optional(),
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
  PAYSTACK_SECRET_KEY: optionalString,
  PAYSTACK_PUBLIC_KEY: optionalString,
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
  paystackSecretKey: result.data.PAYSTACK_SECRET_KEY,
  paystackPublicKey: result.data.PAYSTACK_PUBLIC_KEY,
} as const;

