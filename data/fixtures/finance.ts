import type { FinanceState } from "../../contracts";

export const syntheticFinance: FinanceState = {
  financeType: "loan", balance: 15000, monthlyPayment: 450, remainingTermMonths: 36,
  provenance: { financeType: "synthetic", balance: "synthetic", monthlyPayment: "synthetic", remainingTermMonths: "synthetic" },
};
