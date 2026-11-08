ALTER TABLE "payments"
ADD COLUMN "signatureSize" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "ledger_entries"
ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "ledger_entries_idempotencyKey_key"
ON "ledger_entries"("idempotencyKey");
