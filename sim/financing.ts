import { MAX_IMPLIED_APR } from "./config";

/** Level monthly payment: P * r / (1 - (1 + r)^-n), r = APR / 12. Zero APR divides evenly. */
export function loanPayment(principal: number, apr: number, months: number): number {
  if (principal <= 0 || months <= 0) return 0;
  const r = apr / 12;
  return r === 0 ? principal / months : principal * r / (1 - (1 + r) ** -months);
}

/** Present value of n level payments at APR. */
function presentValue(payment: number, apr: number, months: number): number {
  const r = apr / 12;
  return r === 0 ? payment * months : payment * (1 - (1 + r) ** -months) / r;
}

/**
 * APR at which `months` payments of `payment` exactly repay `balance` (bisection, 100 steps).
 * Returns 0 when the payments do not even cover the balance at 0%, and MAX_IMPLIED_APR when they overpay at the cap.
 */
export function impliedApr(balance: number, payment: number, months: number): number {
  if (balance <= 0 || payment <= 0 || months <= 0 || payment * months <= balance) return 0;
  let lo = 0, hi = MAX_IMPLIED_APR;
  if (presentValue(payment, hi, months) > balance) return hi;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (presentValue(payment, mid, months) > balance) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export interface LoanStep { interest: number; principal: number; paid: number; balance: number }

/** One month: interest accrues on the balance, then the payment (capped at what is owed) is applied. */
export function amortizeStep(balance: number, apr: number, payment: number): LoanStep {
  if (balance <= 0) return { interest: 0, principal: 0, paid: 0, balance: 0 };
  const interest = balance * apr / 12;
  const paid = Math.min(payment, balance + interest);
  const principal = paid - interest;
  const next = balance - principal;
  return { interest, principal, paid, balance: next < 1e-6 ? 0 : next };
}
