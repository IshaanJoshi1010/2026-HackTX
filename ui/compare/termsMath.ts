/**
 * Pure helpers for the "review your purchase and insurance terms" flow. No React, no store.
 * Every number the person sees as "now" is what Dev 4's sim reported using (with its own source label);
 * every number they enter is validated and converted by Dev 3's helper. This only places and words them.
 */
import type { Source } from "@/contracts";
import { TERM_KEYS } from "@/ui/store/useForkStore";
import type { SimAssumption } from "@/ui/mocks";

export interface TermField {
  field: string;
  label: string;
  unit: string;
}

/** Which input the sim reports for each field, and how its value relates to what the person types. */
const SIM_INPUT: Record<string, { key: string; scale: number }> = {
  insurancePerMonth: { key: "insurancePerMonth", scale: 1 },
  replacementPrice: { key: "replacement.price", scale: 1 },
  downPayment: { key: "replacement.downPayment", scale: 1 },
  purchaseFees: { key: "replacement.fees", scale: 1 },
  salesTaxPercent: { key: "replacement.salesTaxRate", scale: 100 },
  newLoanAprPercent: { key: "replacement.apr", scale: 100 },
  newLoanTermMonths: { key: "replacement.termMonths", scale: 1 },
  loanAprPercent: { key: "loanApr", scale: 100 },
};

/** The scenario assumption key each field becomes (percent fields become fractions), and back. */
const ASSUMPTION_KEY: Record<string, { key: string; scale: number }> = {
  insurancePerMonth: { key: "insurancePerMonth", scale: 1 },
  replacementPrice: { key: "replacementPrice", scale: 1 },
  downPayment: { key: "downPayment", scale: 1 },
  purchaseFees: { key: "purchaseFees", scale: 1 },
  salesTaxPercent: { key: "salesTaxRate", scale: 100 },
  newLoanAprPercent: { key: "newLoanApr", scale: 100 },
  newLoanTermMonths: { key: "newLoanTermMonths", scale: 1 },
  loanAprPercent: { key: "loanApr", scale: 100 },
};

const round = (n: number) => Math.round(n * 10_000) / 10_000;

export interface CurrentTerm {
  value: number;
  source: Source;
}

/** What the sim is using right now for each field, with the label it reported. Absent when it does not use one. */
export function currentTerms(assumptions: SimAssumption[], fields: readonly TermField[]): Record<string, CurrentTerm | undefined> {
  const out: Record<string, CurrentTerm | undefined> = {};
  for (const { field } of fields) {
    const map = SIM_INPUT[field];
    const found = map && assumptions.find((a) => a.key === map.key);
    out[field] = found && typeof found.value === "number" ? { value: round(found.value * map.scale), source: found.source } : undefined;
  }
  return out;
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const plain = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** "$130 a month", "$30,000", "6.25%", "60 months". */
export function formatTerm(field: string, unit: string, value: number): string {
  if (unit === "USD/month") return `${usd.format(value)} a month`;
  if (unit === "USD") return usd.format(value);
  if (unit === "percent") return `${plain.format(value)}%`;
  if (unit === "months") return `${plain.format(value)} months`;
  return plain.format(value);
}

/** Only the boxes the person filled in, as numbers. A blank box is skipped. `bad` lists boxes that are not a number. */
export function parseEntered(raw: Record<string, string>): { entered: Record<string, number>; bad: string[] } {
  const entered: Record<string, number> = {};
  const bad: string[] = [];
  for (const [field, text] of Object.entries(raw)) {
    if (text.trim() === "") continue;
    const n = Number(text.replace(/[$,%\s]/g, "").replace(/,/g, ""));
    if (text.replace(/[$,%\s]/g, "") === "" || !Number.isFinite(n)) bad.push(field);
    else entered[field] = n;
  }
  return { entered, bad };
}

/**
 * The helper checks a down payment against a price only when both are entered. When only the down payment is,
 * it has to be checked against the price actually in use.
 */
export function checkAgainstPrice(entered: Record<string, number>, priceInUse: number | undefined): string | null {
  if (entered.downPayment === undefined || entered.replacementPrice !== undefined || priceInUse === undefined) return null;
  return entered.downPayment > priceInUse ? `That down payment is more than the purchase price in use (${usd.format(priceInUse)}).` : null;
}

export interface AppliedTerm {
  field: string;
  label: string;
  text: string;
}

/** The terms in effect, in the person's own units, in the order of the form. Empty when none were entered. */
export function describeApplied(assumptions: Record<string, number>, fields: readonly TermField[]): AppliedTerm[] {
  const out: AppliedTerm[] = [];
  for (const { field, label, unit } of fields) {
    const map = ASSUMPTION_KEY[field];
    const value = map && assumptions[map.key];
    if (typeof value === "number") out.push({ field, label, text: formatTerm(field, unit, round(value * map.scale)) });
  }
  return out;
}

/** The entered terms found on a scenario's assumptions (only the keys the form can set). */
export function termsOf(assumptions: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(assumptions).filter(([key]) => (TERM_KEYS as readonly string[]).includes(key)));
}
