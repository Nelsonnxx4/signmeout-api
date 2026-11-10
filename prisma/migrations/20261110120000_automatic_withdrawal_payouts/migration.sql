ALTER TABLE "withdrawals"
ADD COLUMN "payoutAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "payoutNextAttemptAt" TIMESTAMP(3),
ADD COLUMN "payoutLockedUntil" TIMESTAMP(3);

CREATE INDEX "withdrawals_payout_worker_idx"
ON "withdrawals"("status", "adminResponseDeadline", "payoutNextAttemptAt", "payoutLockedUntil");
