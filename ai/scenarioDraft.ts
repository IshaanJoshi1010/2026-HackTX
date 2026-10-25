import { z } from "zod";
import type { LifeEvent } from "../contracts";
const amount = z.number().finite().nonnegative();
/** Optional human-entered values only; percentages are entered as percent, converted by code. */
export const ScenarioTermsSchema = z.object({
  insurancePerMonth: amount.optional(), replacementPrice: amount.optional(), downPayment: amount.optional(),
  purchaseFees: amount.optional(), salesTaxPercent: amount.max(100).optional(),
  newLoanAprPercent: amount.max(100).optional(), newLoanTermMonths: amount.int().min(1).max(120).optional(),
  loanAprPercent: amount.max(100).optional(),
}).strict().superRefine((terms, ctx) => {
  if (terms.downPayment !== undefined && terms.replacementPrice !== undefined && terms.downPayment > terms.replacementPrice)
    ctx.addIssue({ code: "custom", path: ["downPayment"], message: "Down payment cannot exceed the entered purchase price" });
});
export const scenarioTermFields = [
  { field: "insurancePerMonth", label: "Insurance per month", unit: "USD/month" },
  { field: "replacementPrice", label: "Replacement purchase price", unit: "USD" },
  { field: "downPayment", label: "Down payment", unit: "USD" },
  { field: "purchaseFees", label: "Purchase fees", unit: "USD" },
  { field: "salesTaxPercent", label: "Sales tax", unit: "percent" },
  { field: "newLoanAprPercent", label: "Replacement loan APR", unit: "percent" },
  { field: "newLoanTermMonths", label: "Replacement loan term", unit: "months" },
  { field: "loanAprPercent", label: "Existing loan APR", unit: "percent" },
] as const;
export function prepareScenarioTerms(input: unknown) {
  const parsed = ScenarioTermsSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Check the purchase and insurance values", issues: parsed.error.issues };
  const assumptions: Record<string, number> = {};
  for (const [field, value] of Object.entries(parsed.data)) {
    const percent = field.endsWith("Percent");
    const key = field === "salesTaxPercent" ? "salesTaxRate" : percent ? field.replace("Percent", "") : field;
    assumptions[key] = percent ? value / 100 : value;
  }
  return { ok: true as const, status: "proposed" as const, assumptions,
    provenance: Object.fromEntries(Object.keys(assumptions).map(key => [key, "user" as const])) };
}
const eventInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("relocation"), month: amount.int().max(60), location: z.string().trim().min(1).max(200) }).strict(),
  z.object({ type: z.literal("mileage_change"), month: amount.int().max(60), annualMiles: amount }).strict(),
  z.object({ type: z.literal("family_change"), month: amount.int().max(60), children: amount.int() }).strict(),
  z.object({ type: z.literal("cargo_change"), month: amount.int().max(60), cargoNeed: z.enum(["low", "medium", "high"]) }).strict(),
  z.object({ type: z.literal("budget_change"), month: amount.int().max(60), monthlyBudget: amount }).strict(),
  z.object({ type: z.literal("fuel_price_change"), month: amount.int().max(60), fuelPricePerGal: amount }).strict(),
]);
/** No ID allocation or mutation. The caller stages this and confirms explicitly. */
export function prepareManualEvent(input: unknown) {
  const parsed = eventInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Check the event values and month (0 to 60)" };
  const { type, month, ...payload } = parsed.data;
  const event: Omit<LifeEvent, "id"> = { type, month, payload, source: "user", assumptions: [], certainty: "clear", status: "proposed" };
  return { ok: true as const, event };
}
