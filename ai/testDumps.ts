import type { EventType, ProfilePatch } from "../contracts";
import type { Extraction, ExtractionItem } from "./schema";

export interface ExtractionCase {
  id: string; prompt: string; expected: Extraction;
  events: { type: EventType; month: number; payload: Record<string, number | string>; certainty: "clear" | "inferred" }[];
  patchFields: ProfilePatch["field"][]; unresolved: number;
}
const item = (field: ExtractionItem["field"], value: ExtractionItem["value"], quote: string,
  month?: string, certainty: ExtractionItem["certainty"] = "clear"): ExtractionItem =>
  ({ field, value, quote, certainty, assumptions: [], ...(month ? { month } : {}) });
const output = (items: ExtractionItem[], intent: Extraction["intent"] = "CREATE_SCENARIO"): Extraction => ({ intent, items });
const event = (type: EventType, month: number, payload: Record<string, number | string>, certainty: "clear" | "inferred" = "clear") => ({ type, month, payload, certainty });
export const testDumps: ExtractionCase[] = [
  { id: "demo", prompt: "I'm moving to Denver next year, driving 20,000 miles annually, and expecting my second child in 2029.",
    expected: output([item("location", "Denver", "moving to Denver next year", "next year"), item("annualMiles", 20000, "driving 20,000 miles annually"), item("children", 2, "expecting my second child in 2029", "in 2029")]),
    events: [event("relocation", 12, { location: "Denver" }), event("mileage_change", 0, { annualMiles: 20000 }), event("family_change", 32, { children: 2 }, "inferred")], patchFields: ["annualMiles"], unresolved: 0 },
  { id: "contradiction", prompt: "I drive like 20k a year, well maybe 15", expected: { ...output([item("annualMiles", null, "I drive like 20k a year, well maybe 15", undefined, "vague")], "CLARIFY"), clarifyingQuestion: { field: "annualMiles", question: "What annual mileage should we use?", options: ["15,000", "20,000", "I'm not sure"] } }, events: [], patchFields: [], unresolved: 1 },
  { id: "vague-time", prompt: "I'm moving to Denver in a couple years", expected: output([item("location", "Denver", "moving to Denver in a couple years", "in a couple years")]), events: [], patchFields: [], unresolved: 1 },
  { id: "vague-commute", prompt: "commute is gonna be way longer", expected: { ...output([item("commuteMilesOneWay", null, "commute is gonna be way longer", undefined, "vague")], "CLARIFY"), clarifyingQuestion: { field: "commuteMilesOneWay", question: "How many miles each way?", options: ["Enter mileage", "I'm not sure"] } }, events: [], patchFields: [], unresolved: 1 },
  { id: "pregnancy", prompt: "wife's pregnant", expected: output([item("childrenDelta", 1, "wife's pregnant", undefined, "inferred")]), events: [event("family_change", 9, { childrenDelta: 1 }, "inferred")], patchFields: [], unresolved: 0 },
  { id: "multiple", prompt: "Move to Austin in 6 months. I drive 15k a year and our household is four.", expected: output([item("location", "Austin", "Move to Austin in 6 months", "in 6 months"), item("annualMiles", 15000, "I drive 15k a year"), item("householdSize", 4, "our household is four")]), events: [event("relocation", 6, { location: "Austin" }), event("mileage_change", 0, { annualMiles: 15000 }), event("family_change", 0, { householdSize: 4 })], patchFields: ["annualMiles", "householdSize"], unresolved: 0 },
  { id: "unsupported", prompt: "will my transmission fail?", expected: { intent: "CLARIFY", items: [], unsupported: "Fork cannot diagnose or predict component failures." }, events: [], patchFields: [], unresolved: 0 },
  { id: "greeting", prompt: "hi", expected: output([], "CLARIFY"), events: [], patchFields: [], unresolved: 0 },
  { id: "shorthand", prompt: "20k mi/yr", expected: output([item("annualMiles", 20000, "20k mi/yr")]), events: [event("mileage_change", 0, { annualMiles: 20000 })], patchFields: ["annualMiles"], unresolved: 0 },
  { id: "budget", prompt: "Budget is $500/month.", expected: output([item("monthlyBudget", 500, "Budget is $500/month")]), events: [event("budget_change", 0, { monthlyBudget: 500 })], patchFields: ["monthlyBudget"], unresolved: 0 },
  { id: "pure-rav4-question", prompt: "Would the RAV4 Hybrid make more sense?", expected: output([], "COMPARE_SCENARIOS"), events: [], patchFields: [], unresolved: 0 },
  { id: "annual", prompt: "I drive 12,000 miles a year.", expected: output([item("annualMiles", 12000, "I drive 12,000 miles a year")]), events: [event("mileage_change", 0, { annualMiles: 12000 })], patchFields: ["annualMiles"], unresolved: 0 },
  { id: "commute", prompt: "My commute is 25 miles each way, 3 days a week.", expected: output([item("commuteMilesOneWay", 25, "My commute is 25 miles each way"), item("commuteDaysPerWeek", 3, "3 days a week")]), events: [event("mileage_change", 0, { commuteMilesOneWay: 25, commuteDaysPerWeek: 3 })], patchFields: ["commuteMilesOneWay", "commuteDaysPerWeek"], unresolved: 0 },
  { id: "fuel", prompt: "Gas costs $3.50 per gallon.", expected: output([item("fuelPricePerGal", 3.5, "Gas costs $3.50 per gallon")]), events: [event("fuel_price_change", 0, { fuelPricePerGal: 3.5 })], patchFields: ["fuelPricePerGal"], unresolved: 0 },
  { id: "children", prompt: "We have two children.", expected: output([item("children", 2, "We have two children")]), events: [event("family_change", 0, { children: 2 })], patchFields: ["children"], unresolved: 0 },
  { id: "cargo", prompt: "Cargo need is high.", expected: output([item("cargoNeed", "high", "Cargo need is high")]), events: [event("cargo_change", 0, { cargoNeed: "high" })], patchFields: ["cargoNeed"], unresolved: 0 },
  { id: "paid-off", prompt: "My car is paid off.", expected: output([item("financeType", "paid_off", "My car is paid off")]), events: [], patchFields: ["financeType"], unresolved: 0 },
  { id: "payment", prompt: "My monthly payment is $350.", expected: output([item("financePayment", 350, "My monthly payment is $350")]), events: [], patchFields: ["financePayment"], unresolved: 0 },
  { id: "replacement", prompt: "Switch to a 2024 RAV4 Hybrid XLE next year.", expected: output([item("vehicleId", "2024 RAV4 Hybrid XLE", "Switch to a 2024 RAV4 Hybrid XLE next year", "next year")]), events: [event("vehicle_replacement", 12, { vehicleId: "rav4-2024-hybrid-xle" })], patchFields: [], unresolved: 0 },
  { id: "break-even", prompt: "What would make keeping my Camry the better option?", expected: output([], "FIND_BREAK_EVEN"), events: [], patchFields: [], unresolved: 0 },
];
