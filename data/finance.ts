import type { DriverProfile, FinanceState, Question } from "../contracts";
import { FinanceStateSchema } from "../contracts/schemas";
import type { FinanceInput } from "./normalize";
import { defaultsTable } from "./defaults";
export interface FinanceContext { price: number; vehicleYear: number; currentYear: number }
export interface FinanceResolution { finance: FinanceState; question: Question | null; nextAction: string | null; assumptions: string[] }
/** Deterministic, labeled demo estimate. Never a lender quote or provider account. */
export function resolveFinance(profile: DriverProfile, input: FinanceInput, ctx: FinanceContext): FinanceResolution {
  if (!Number.isFinite(ctx.price) || ctx.price < 0 || !Number.isInteger(ctx.currentYear) || !Number.isInteger(ctx.vehicleYear) || ctx.currentYear < ctx.vehicleYear) throw new Error("Invalid finance price or vehicle age");
  if (input.payment !== undefined && (!Number.isFinite(input.payment) || input.payment < 0)) throw new Error("Invalid payment");
  if (input.endMonth !== undefined && (!Number.isInteger(input.endMonth) || input.endMonth < 0)) throw new Error("Invalid lease end month");
  const type = profile.financeType, paidOff = type === "paid_off", lease = type === "lease";
  const ageMonths = (ctx.currentYear - ctx.vehicleYear) * 12;
  const term = paidOff ? 0 : lease ? input.endMonth ?? 24 : Math.max(12, 72 - ageMonths);
  const balance = paidOff || lease ? 0 : Math.round(ctx.price * 0.8 * term / 72);
  const rate = defaultsTable.interestApr.value / 12;
  const calculatedPayment = paidOff ? 0 : lease ? Math.round(ctx.price * 0.012) : Math.round(balance * rate / (1 - (1 + rate) ** -term));
  const payment = paidOff ? 0 : input.payment ?? calculatedPayment;
  const finance: FinanceState = {
    financeType: type, balance, monthlyPayment: payment, remainingTermMonths: term,
    ...(lease ? { leaseEndMonth: term } : {}),
    provenance: { financeType: profile.provenance.financeType, balance: "estimated",
      monthlyPayment: !paidOff && input.payment !== undefined ? "user" : "estimated",
      remainingTermMonths: lease && input.endMonth !== undefined ? "user" : "estimated",
      ...(lease ? { leaseEndMonth: input.endMonth !== undefined ? "user" as const : "estimated" as const } : {}) },
  };
  const question: Question | null = paidOff || type === "unknown" ? null
    : input.payment === undefined ? { field: "financePayment", text: "What is your monthly payment?", kind: "number", impactNote: "Changes projected monthly cash outflow." }
    : lease && input.endMonth === undefined ? { field: "financeEndMonth", text: "How many months until your lease ends?", kind: "number", impactNote: "Changes the timing of lease payments and replacement." } : null;
  return { finance: FinanceStateSchema.parse(finance), question, nextAction: type === "unknown" ? "get a payoff quote" : null,
    assumptions: paidOff ? ["Paid-off selection requires no additional finance questions."] : [
      "Estimated demo finance only; no account or credit data was accessed.",
      `Original loan term 72 months; remaining term uses whole-year vehicle age with a 12-month minimum; 20% initial down payment; illustrative APR ${defaultsTable.interestApr.value}.`,
      "Loan balance uses a straight-line age adjustment to the assumed original principal; payment uses amortization of that estimated remaining balance.",
      "Lease payment defaults to 1.2% of price monthly and end month to 24 when missing. These are labeled demo assumptions, not market offers.",
    ] };
}
