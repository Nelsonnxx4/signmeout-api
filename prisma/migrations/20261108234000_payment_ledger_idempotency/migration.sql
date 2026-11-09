ALTER TABLE "payments"
ADD COLUMN "signatureSize" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "payments"
ADD COLUMN "ownerBasisPoints" INTEGER NOT NULL DEFAULT 8500,
ADD COLUMN "platformBasisPoints" INTEGER NOT NULL DEFAULT 1500,
ADD COLUMN "commissionPolicyVersion" TEXT NOT NULL DEFAULT '2026-11-08-15pct-v1';

ALTER TABLE "ledger_entries"
ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "ledger_entries_idempotencyKey_key"
ON "ledger_entries"("idempotencyKey");

ALTER TYPE "LedgerEntryType" ADD VALUE 'WITHDRAWAL_REVERSAL';

ALTER TABLE "withdrawals"
ADD COLUMN "idempotencyKey" TEXT;

UPDATE "withdrawals"
SET "idempotencyKey" = 'migration:' || "id"::text
WHERE "idempotencyKey" IS NULL;

ALTER TABLE "withdrawals"
ALTER COLUMN "idempotencyKey" SET NOT NULL;

CREATE UNIQUE INDEX "withdrawals_idempotencyKey_key"
ON "withdrawals"("idempotencyKey");

CREATE UNIQUE INDEX "withdrawals_transferReference_key"
ON "withdrawals"("transferReference");
