import type { LifeEvent } from "../contracts";
import { demoBrainDump, demoTodayISO } from "./demo";

export type DemoCaseId = "close-call" | "camry-win" | "rav4-win";
export type DemoEvent = Pick<LifeEvent, "type" | "month" | "payload">;
export interface DemoCase {
  id: DemoCaseId;
  title: string;
  expectedVerdict: "inconclusive" | "keep" | "replace";
  todayISO: string;
  descriptions: string[];
  expectedEvents: DemoEvent[];
  replacementMonth: number;
  purpose: string;
}
// Expected verdicts are regression assertions, never inputs to interpretation, simulation or scoring.
// All cases start with a fresh fictional Alex twin, default equal priorities and unchanged purchase assumptions.
const cases: DemoCase[] = [
  {
    id: "close-call", title: "A growing family, a genuine tradeoff", expectedVerdict: "inconclusive", todayISO: demoTodayISO,
    descriptions: [
      demoBrainDump,
      "I will relocate to Denver in 12 months; my annual mileage is 20k; I am expecting my second child in June 2029.",
      "I drive 20000 miles per year. I'm moving to Denver next year. My second child is due in June 2029.",
      "I'm moving to Denver next year and driving 20k miles annually and expecting my second child in 2029.",
    ],
    expectedEvents: [
      { type: "relocation", month: 12, payload: { location: "Denver" } },
      { type: "mileage_change", month: 0, payload: { annualMiles: 20000 } },
      { type: "family_change", month: 32, payload: { children: 2 } },
    ],
    replacementMonth: 12,
    purpose: "Family timing, relocation, honest inconclusive verdict and computed mileage break-even. Bare 2029 means June, visibly inferred.",
  },
  {
    id: "camry-win", title: "Less driving, keep the Camry", expectedVerdict: "keep", todayISO: demoTodayISO,
    descriptions: [
      "I drive 8,000 miles a year.",
      "My annual mileage is 8k.",
      "I am driving about 8000 miles per year.",
      "MY YEARLY MILEAGE IS 8000.",
    ],
    expectedEvents: [{ type: "mileage_change", month: 0, payload: { annualMiles: 8000 } }],
    replacementMonth: 12,
    purpose: "A customer-first keep verdict: low mileage and Alex's existing low cargo needs do not justify replacing the car.",
  },
  {
    id: "rav4-win", title: "More driving and more cargo", expectedVerdict: "replace", todayISO: demoTodayISO,
    descriptions: [
      "I drive 30,000 miles a year, and I will have high cargo needs next year.",
      "My annual mileage is 30k; my cargo needs will be high in 12 months.",
      "I am driving about 30000 miles per year. I need high cargo capacity next year.",
      "MY YEARLY MILEAGE IS 30000. MY CARGO NEEDS WILL BE HIGH NEXT YEAR.",
    ],
    expectedEvents: [
      { type: "mileage_change", month: 0, payload: { annualMiles: 30000 } },
      { type: "cargo_change", month: 12, payload: { cargoNeed: "high" } },
    ],
    replacementMonth: 12,
    purpose: "A RAV4 recommendation driven by fuel use and cargo suitability, while acknowledging its higher modeled ownership cost.",
  },
];
/** Fresh copies: rehearsal edits cannot contaminate the next recording or another test. */
export function getDemoCases(): DemoCase[] { return structuredClone(cases); }
