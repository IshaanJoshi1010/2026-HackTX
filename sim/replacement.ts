import type { SimulationResult, Source } from "../contracts";
import {
  DEFAULT_DOWN_PAYMENT_FRACTION, DEFAULT_NEW_LOAN_APR, DEFAULT_NEW_LOAN_TERM_MONTHS, DEFAULT_PURCHASE_FEES, DEFAULT_SALES_TAX_RATE,
} from "./config";
import { loanPayment } from "./financing";

export interface PurchaseTerms {
  price: number; salesTaxRate: number; fees: number; downPayment: number; apr: number; termMonths: number;
  sources: Record<"price" | "salesTaxRate" | "fees" | "downPayment" | "apr" | "termMonths", Source>;
}

const pick = (entered: number | undefined, fallback: number, fallbackSource: Source): [number, Source] =>
  entered !== undefined && Number.isFinite(entered) && entered >= 0 ? [entered, "user"] : [fallback, fallbackSource];

/**
 * Purchase terms for a replacement. Price precedence: the event's price, then scenario.assumptions.replacementPrice,
 * then the caller's default (modeled market value). Everything else: scenario.assumptions, then /sim/config.ts.
 */
export function purchaseTerms(a: Record<string, number>, eventPrice: number | undefined,
  defaultPrice: number, defaultPriceSource: Source): PurchaseTerms {
  const [price, priceSrc] = eventPrice !== undefined ? [eventPrice, "user" as Source] : pick(a.replacementPrice, defaultPrice, defaultPriceSource);
  const [salesTaxRate, taxSrc] = pick(a.salesTaxRate, DEFAULT_SALES_TAX_RATE, "illustrative");
  const [fees, feeSrc] = pick(a.purchaseFees, DEFAULT_PURCHASE_FEES, "illustrative");
  const [down, downSrc] = pick(a.downPayment, price * DEFAULT_DOWN_PAYMENT_FRACTION, "illustrative");
  const [apr, aprSrc] = pick(a.newLoanApr, DEFAULT_NEW_LOAN_APR, "illustrative");
  const [term, termSrc] = pick(a.newLoanTermMonths, DEFAULT_NEW_LOAN_TERM_MONTHS, "illustrative");
  return {
    price, salesTaxRate, fees, downPayment: Math.min(down, price), apr, termMonths: Math.max(1, Math.round(term)),
    sources: { price: priceSrc, salesTaxRate: taxSrc, fees: feeSrc, downPayment: downSrc, apr: aprSrc, termMonths: termSrc },
  };
}

/** Tax and fees, paid in cash at purchase. This is the only net cost of the purchase at that instant. */
export const taxAndFees = (t: PurchaseTerms): number => t.price * t.salesTaxRate + t.fees;
export const financedAmount = (t: PurchaseTerms): number => t.price - t.downPayment;
export const newLoanPayment = (t: PurchaseTerms): number => loanPayment(financedAmount(t), t.apr, t.termMonths);

/**
 * The three separate views of a result. Never merge them:
 * 1. cash: cumulative cash outflow (every dollar paid, minus sale proceeds)
 * 2. position: what is owned and owed at each month
 * 3. net: net economic ownership cost
 */
export function economicViews(r: SimulationResult) {
  return {
    cash: r.points.map(p => ({ month: p.month, cumulativeCash: p.cumulativeCash })),
    position: r.points.map(p => ({ month: p.month, vehicleId: p.vehicleId, vehicleValue: p.vehicleValue, loanBalance: p.loanBalance })),
    net: r.points.map(p => ({ month: p.month, netEconomicCost: p.netEconomicCost })),
  };
}
