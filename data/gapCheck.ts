import type { DriverProfile, FieldKey, Question } from "../contracts";
export interface GapContext {
  view: "keep" | "compare";
  vagueCommute?: boolean; budgetMentioned?: boolean;
  declined?: FieldKey[]; financeQuestion?: Question | null;
}
const backed = (profile: DriverProfile, field: string) => ["user", "sourced", "listing", "synthetic"].includes(profile.provenance[field]);
export function gapCheck(profile: DriverProfile, ctx: GapContext): { missing: FieldKey[]; question: Question | null } {
  const candidates: Question[] = [];
  if (ctx.view === "compare" && (profile.financeType === "unknown" || !backed(profile, "financeType"))) candidates.push({
    field: "financeType", text: "How is your current vehicle financed?", kind: "chips", options: ["Paid off", "Loan", "Lease", "I'm not sure"], impactNote: "Changes payment and loan-balance projections.",
  });
  if (ctx.view === "compare" && !backed(profile, "cargoNeed")) candidates.push({
    field: "cargoNeed", text: "How much cargo space do you need?", kind: "chips", options: ["Low", "Medium", "High", "I'm not sure"], impactNote: "Changes the cargo-fit comparison.",
  });
  if (ctx.vagueCommute && profile.commuteMilesOneWay === undefined) candidates.push({ field: "commuteMilesOneWay",
    text: "How many miles will your commute be each way?", kind: "number", impactNote: "Changes annual mileage and fuel spend; weekly commute days are also needed before recalculating." });
  if (ctx.vagueCommute && profile.commuteMilesOneWay !== undefined && profile.commuteDaysPerWeek === undefined) candidates.push({
    field: "commuteDaysPerWeek", text: "How many days per week will you commute?", kind: "number", impactNote: "Completes the commute-based annual-mileage calculation." });
  if (ctx.budgetMentioned && profile.monthlyBudget === undefined) candidates.push({ field: "monthlyBudget",
    text: "What is your monthly vehicle budget?", kind: "number", impactNote: "Changes the budget constraint in the comparison." });
  // Finance-specific followups come after the canonical four impact priorities, one at a time.
  if (ctx.view === "compare" && ctx.financeQuestion &&
    ((["loan", "lease"].includes(profile.financeType) && ctx.financeQuestion.field === "financePayment") ||
     (profile.financeType === "lease" && ctx.financeQuestion.field === "financeEndMonth"))) candidates.push(ctx.financeQuestion);
  const unique = candidates.filter((q, i) => !ctx.declined?.includes(q.field) && candidates.findIndex(other => other.field === q.field) === i);
  return { missing: unique.map(q => q.field), question: unique[0] ?? null };
}
