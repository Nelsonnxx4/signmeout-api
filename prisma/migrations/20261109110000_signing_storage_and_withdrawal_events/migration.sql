ALTER TABLE "shirt_model_versions"
ADD COLUMN "placementConfig" JSONB;

CREATE TABLE "withdrawal_events" (
    "id" UUID NOT NULL,
    "withdrawalId" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "providerReference" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "withdrawal_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "withdrawal_events_withdrawalId_receivedAt_idx"
ON "withdrawal_events"("withdrawalId", "receivedAt");

ALTER TABLE "withdrawal_events"
ADD CONSTRAINT "withdrawal_events_withdrawalId_fkey"
FOREIGN KEY ("withdrawalId") REFERENCES "withdrawals"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
