export interface WithdrawalLedgerTotals {
  ownerCreditsKobo: number;
  withdrawalHoldsKobo: number;
  withdrawalReleasesKobo: number;
  withdrawalCompletedKobo: number;
  withdrawalReversalsKobo: number;
}

export function calculateWithdrawalBalance(totals: WithdrawalLedgerTotals) {
  const pendingHolds =
    totals.withdrawalHoldsKobo -
    totals.withdrawalReleasesKobo -
    totals.withdrawalCompletedKobo;
  const totalWithdrawn =
    totals.withdrawalCompletedKobo - totals.withdrawalReversalsKobo;

  const availableBalance =
    totals.ownerCreditsKobo - pendingHolds - totalWithdrawn;

  if (pendingHolds < 0 || totalWithdrawn < 0 || availableBalance < 0) {
    throw new RangeError("Withdrawal ledger entries are inconsistent.");
  }

  return {
    totalEarned: totals.ownerCreditsKobo,
    pendingHolds,
    totalWithdrawn,
    availableBalance,
  };
}

export const WITHDRAWAL_TRANSITIONS = {
  PENDING: ["PROCESSING", "REQUIRES_ACTION", "PAID", "FAILED", "CANCELLED"],
  PROCESSING: ["REQUIRES_ACTION", "PAID", "FAILED", "REVERSED"],
  REQUIRES_ACTION: ["PENDING", "PROCESSING", "PAID", "FAILED", "REVERSED", "CANCELLED"],
  PAID: ["REVERSED"],
  FAILED: [],
  REVERSED: [],
  CANCELLED: [],
} as const;
