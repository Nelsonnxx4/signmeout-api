ALTER TABLE "withdrawals"
ADD COLUMN "bankCode" TEXT,
ADD COLUMN "bankName" TEXT,
ADD COLUMN "accountNumber" TEXT,
ADD COLUMN "accountName" TEXT,
ADD COLUMN "paystackRecipient" TEXT,
ADD COLUMN "adminResponseDeadline" TIMESTAMP(3);

UPDATE "withdrawals" AS w
SET
    "bankCode" = b."bankCode",
    "bankName" = b."bankName",
    "accountNumber" = b."accountNumber",
    "accountName" = b."accountName",
    "paystackRecipient" = b."paystackRecipient",
    "adminResponseDeadline" = w."requestedAt" + INTERVAL '10 minutes'
FROM "bank_accounts" AS b
WHERE b."userId" = w."userId";

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM "withdrawals"
        WHERE "bankCode" IS NULL
           OR "bankName" IS NULL
           OR "accountNumber" IS NULL
           OR "accountName" IS NULL
           OR "adminResponseDeadline" IS NULL
    ) THEN
        RAISE EXCEPTION 'Cannot migrate withdrawals without a saved bank account';
    END IF;
END $$;

ALTER TABLE "withdrawals"
ALTER COLUMN "bankCode" SET NOT NULL,
ALTER COLUMN "bankName" SET NOT NULL,
ALTER COLUMN "accountNumber" SET NOT NULL,
ALTER COLUMN "accountName" SET NOT NULL,
ALTER COLUMN "adminResponseDeadline" SET NOT NULL;

CREATE TABLE "withdrawal_alerts" (
    "id" UUID NOT NULL,
    "withdrawalId" UUID NOT NULL,
    "emailSentAt" TIMESTAMP(3),
    "webhookSentAt" TIMESTAMP(3),
    "emailAttempts" INTEGER NOT NULL DEFAULT 0,
    "webhookAttempts" INTEGER NOT NULL DEFAULT 0,
    "emailLastError" TEXT,
    "webhookLastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "withdrawal_alerts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "withdrawal_alerts_withdrawalId_key"
ON "withdrawal_alerts"("withdrawalId");

CREATE INDEX "withdrawal_alerts_nextAttemptAt_lockedUntil_idx"
ON "withdrawal_alerts"("nextAttemptAt", "lockedUntil");

ALTER TABLE "withdrawal_alerts"
ADD CONSTRAINT "withdrawal_alerts_withdrawalId_fkey"
FOREIGN KEY ("withdrawalId") REFERENCES "withdrawals"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
