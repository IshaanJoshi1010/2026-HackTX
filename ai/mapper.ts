import type { EventType, InterpretContext, InterpretResult, LifeEvent, ProfilePatch } from "../contracts";
import { FieldKeySchema, InterpretContextSchema, InterpretResultSchema } from "../contracts/schemas";
import { normalizeProfile } from "../data/normalize";
import { ExtractionSchema, type Extraction, type ExtractionItem } from "./schema";
import { resolveEventMonth } from "./dates";

export interface MappedExtraction { result: InterpretResult; unresolved: ExtractionItem[]; clarification?: Extraction["clarifyingQuestion"] }
const eventTypes: Partial<Record<ExtractionItem["field"], EventType>> = {
  location: "relocation", annualMiles: "mileage_change", commuteMilesOneWay: "mileage_change", commuteDaysPerWeek: "mileage_change",
  children: "family_change", childrenDelta: "family_change", householdSize: "family_change", carSeats: "family_change",
  cargoNeed: "cargo_change", monthlyBudget: "budget_change", fuelPricePerGal: "fuel_price_change", vehicleId: "vehicle_replacement",
};
const numericFields = new Set(["annualMiles", "commuteMilesOneWay", "commuteDaysPerWeek", "householdSize", "children", "childrenDelta", "carSeats", "monthlyBudget", "fuelPricePerGal", "financePayment", "financeEndMonth", "mileage"]);
function hash(text: string): string {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return (value >>> 0).toString(16);
}
function pregnancyMention(quote: string): boolean { return /\bpregnant\b/i.test(quote) && !/\bnot\b|\bisn't\b|\bno longer\b|\bmight\b|\bmaybe\b/i.test(quote); }
function numericEvidence(value: number, quote: string): boolean {
  const quantities = [...quote.matchAll(/\b(\d+(?:,\d{3})*(?:\.\d+)?)\s*(k)?\b/gi)].map(m => Number(m[1].replaceAll(",", "")) * (m[2] ? 1000 : 1));
  const words: Record<string, number> = { zero: 0, one: 1, first: 1, two: 2, second: 2, three: 3, third: 3, four: 4, fourth: 4 };
  return quantities.includes(value) || Object.entries(words).some(([word, number]) => number === value && new RegExp(`\\b${word}\\b`, "i").test(quote));
}
function mappedValue(item: ExtractionItem): number | string | undefined {
  if (item.value === null) return undefined;
  if (item.field === "childrenDelta") return item.certainty === "inferred" && pregnancyMention(item.quote) && item.value === 1 ? 1 : undefined;
  if (item.field === "vehicleId") {
    const names: Record<string, string> = { "2022 camry se": "camry-2022-se", "2024 rav4 hybrid xle": "rav4-2024-hybrid-xle" };
    return typeof item.value === "string" && item.quote.toLowerCase().includes(item.value.toLowerCase()) ? names[item.value.toLowerCase()] : undefined;
  }
  if (item.field === "location") return typeof item.value === "string" && item.quote.toLowerCase().includes(item.value.toLowerCase()) ? item.value : undefined;
  // Finance and odometer values are patches rather than simulation payload keys.
  const rawKey = item.field === "mileage" ? "annualMiles" : item.field;
  if (item.field === "financePayment" || item.field === "financeEndMonth") {
    const parsed = typeof item.value === "number" ? item.value : Number(item.value.replaceAll(/[$,]/g, ""));
    return Number.isFinite(parsed) && parsed >= 0 && (item.field !== "financeEndMonth" || Number.isInteger(parsed)) && numericEvidence(parsed, item.quote) ? parsed : undefined;
  }
  const normalized = normalizeProfile({ [rawKey]: item.value });
  if (!normalized.ok) return undefined;
  const value = normalized.profile[rawKey as keyof typeof normalized.profile];
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  if (numericFields.has(item.field) && (typeof value !== "number" || !numericEvidence(value, item.quote))) return undefined;
  if (item.field === "cargoNeed" && !item.quote.toLowerCase().includes(String(value))) return undefined;
  if (item.field === "financeType" && !item.quote.toLowerCase().replaceAll(" ", "_").includes(String(value))) return undefined;
  return value;
}

/** Maps validated, quoted extractions to proposals only. Never mutates the context/profile. */
export function mapExtraction(input: unknown, context: InterpretContext, prompt: string): MappedExtraction {
  const extraction = ExtractionSchema.parse(input);
  InterpretContextSchema.parse(context);
  if (extraction.unsupported) return { result: { aiAvailable: true, intent: extraction.intent, proposals: [], profilePatches: [], unsupportedReason: extraction.unsupported }, unresolved: [] };
  if (!["CREATE_SCENARIO", "CLARIFY"].includes(extraction.intent)) return {
    result: { aiAvailable: true, intent: extraction.intent, proposals: [], profilePatches: [] }, unresolved: extraction.items,
  };
  const unresolved: ExtractionItem[] = [], patches: ProfilePatch[] = [];
  const groups = new Map<string, { event: LifeEvent; items: ExtractionItem[] }>();
  // Compare resolved timing too: next year and in 12 months are the same slot.
  const seen = new Map<string, number | string>(), duplicates = new Set<string>();
  for (const item of extraction.items) {
    if (!prompt.includes(item.quote) || item.certainty === "vague") continue;
    const timing = resolveEventMonth(item.month, context.todayISO, item.field === "childrenDelta" && pregnancyMention(item.quote));
    const value = mappedValue(item);
    if (!timing.resolved || value === undefined) continue;
    const key = `${item.field}|${timing.month}`;
    if (seen.has(key) && seen.get(key) !== value) duplicates.add(key);
    seen.set(key, value);
  }
  for (const item of extraction.items) {
    if (!prompt.includes(item.quote) || (item.month && !item.quote.toLowerCase().includes(item.month.toLowerCase())) || item.certainty === "vague") {
      unresolved.push(item); continue;
    }
    const value = mappedValue(item);
    const timing = resolveEventMonth(item.month, context.todayISO, item.field === "childrenDelta" && pregnancyMention(item.quote));
    if (value === undefined || !timing.resolved || duplicates.has(`${item.field}|${timing.month}`)) { unresolved.push(item); continue; }
    const certainty = item.certainty === "inferred" || timing.inferred ? "inferred" : "clear";
    // Never put a future value straight into the present profile.
    const fieldKey = FieldKeySchema.safeParse(item.field);
    if (timing.month === 0 && fieldKey.success) patches.push({ field: fieldKey.data, value, certainty, quote: item.quote });
    const type = eventTypes[item.field];
    if (!type) {
      if (timing.month > 0) unresolved.push(item);
      continue;
    }
    const key = `${type}:${timing.month}`;
    if (!groups.has(key)) groups.set(key, { event: { id: "", type, month: timing.month, payload: {}, source: "ai", assumptions: [], quote: "", certainty, status: "proposed" }, items: [] });
    const group = groups.get(key)!;
    group.event.payload[item.field] = value;
    group.event.assumptions.push(...item.assumptions, ...timing.assumptions);
    group.items.push(item);
    if (certainty === "inferred") group.event.certainty = "inferred";
  }
  const proposals = [...groups.values()].map(({ event, items }) => {
    event.quote = [...new Set(items.map(item => item.quote))].join("; ");
    event.assumptions = [...new Set(event.assumptions)];
    event.id = `ai-${hash(JSON.stringify({ type: event.type, month: event.month, payload: event.payload, quote: event.quote }))}`;
    return event;
  });
  const result: InterpretResult = { aiAvailable: true, intent: unresolved.length && !proposals.length && !patches.length ? "CLARIFY" : extraction.intent,
    proposals, profilePatches: patches };
  if (extraction.clarifyingQuestion) {
    const field = FieldKeySchema.safeParse(extraction.clarifyingQuestion.field);
    if (field.success) result.question = { field: field.data, text: extraction.clarifyingQuestion.question, kind: "chips",
      options: extraction.clarifyingQuestion.options, impactNote: "Clarifies a quoted extraction; C8b must filter this through the C5 impact gate." };
  }
  InterpretResultSchema.parse(result);
  return { result, unresolved, ...(extraction.clarifyingQuestion ? { clarification: extraction.clarifyingQuestion } : {}) };
}
