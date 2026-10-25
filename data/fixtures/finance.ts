import type { FinanceState } from "../../contracts";

export const syntheticFinance: FinanceState = {
  financeType: "loan", balance: 15000, monthlyPayment: 450, remainingTermMonths: 36,
  provenance: { financeType: "synthetic", balance: "synthetic", monthlyPayment: "synthetic", remainingTermMonths: "synthetic" },
};

/** Separate fictional RAV4 owner: a high-interest remaining loan, fixed across every RAV4 rehearsal. */
export const rav4DemoFinance: FinanceState = {
  financeType: "loan", balance: 24000, monthlyPayment: 650, remainingTermMonths: 60,
  provenance: { financeType: "synthetic", balance: "synthetic", monthlyPayment: "synthetic", remainingTermMonths: "synthetic" },
};
