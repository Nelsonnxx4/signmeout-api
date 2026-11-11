ALTER TABLE "payments"
ADD COLUMN "contributorEmail" VARCHAR(254);

UPDATE "payments"
SET "contributorEmail" = 'legacy-payment@signmeout.invalid'
WHERE "contributorEmail" IS NULL;

ALTER TABLE "payments"
ALTER COLUMN "contributorEmail" SET NOT NULL;

ALTER TABLE "payments"
ADD COLUMN "expiresAt" TIMESTAMP(3),
ADD COLUMN "nextReconciliationAt" TIMESTAMP(3),
ADD COLUMN "reconciliationAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "processingFeeKobo" INTEGER NOT NULL DEFAULT 0;

UPDATE "payments"
SET
  "expiresAt" = "createdAt" + INTERVAL '24 hours',
  "nextReconciliationAt" = CASE
    WHEN "status" = 'PENDING' THEN NOW()
    ELSE NULL
  END
WHERE "expiresAt" IS NULL;

ALTER TABLE "payments"
ALTER COLUMN "expiresAt" SET NOT NULL;

CREATE INDEX "payments_status_nextReconciliationAt_idx"
ON "payments"("status", "nextReconciliationAt");

CREATE TYPE "RefundStatus" AS ENUM (
  'NOT_REQUESTED',
  'PENDING',
  'PROCESSING',
  'PROCESSED',
  'FAILED'
);

ALTER TABLE "payments"
ADD COLUMN "refundStatus" "RefundStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
ADD COLUMN "refundReference" TEXT,
ADD COLUMN "refundReason" TEXT,
ADD COLUMN "disputeStatus" TEXT,
ADD COLUMN "disputeId" TEXT;

CREATE UNIQUE INDEX "payments_refundReference_key"
ON "payments"("refundReference");

CREATE TABLE "email_outbox" (
  "id" UUID NOT NULL,
  "eventType" VARCHAR(100) NOT NULL,
  "recipient" VARCHAR(254) NOT NULL,
  "subject" VARCHAR(200) NOT NULL,
  "body" TEXT NOT NULL,
  "idempotencyKey" VARCHAR(255) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedUntil" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_outbox_idempotencyKey_key"
ON "email_outbox"("idempotencyKey");

CREATE INDEX "email_outbox_sentAt_nextAttemptAt_lockedUntil_idx"
ON "email_outbox"("sentAt", "nextAttemptAt", "lockedUntil");
