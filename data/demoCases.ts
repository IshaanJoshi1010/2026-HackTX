import type { LifeEvent } from "../contracts";
import { demoBrainDump, demoTodayISO, demoStartingVins } from "./demo";

import type { DemoVehicleId } from "./providers";

export type DemoCaseId = "close-call" | "camry-win" | "rav4-win" | "rav4-stay" | "rav4-switch" | "rav4-close-call";
export type DemoEvent = Pick<LifeEvent, "type" | "month" | "payload">;
export interface DemoCase {
  id: DemoCaseId;
  title: string;
  startingVehicleId: DemoVehicleId;
  startingVin: string;
  replacementVehicleId: DemoVehicleId;
  expectedVerdict: "inconclusive" | "keep" | "replace";
  todayISO: string;
  descriptions: string[];
  expectedEvents: DemoEvent[];
  replacementMonth: number;
  purpose: string;
}
// Expected verdicts are regression assertions, never inputs to interpretation, simulation or scoring.
// Each starting VIN has one fixed fictional owner/loan, equal priorities and unchanged purchase assumptions.
const camryCases: Omit<DemoCase, "startingVehicleId" | "startingVin" | "replacementVehicleId">[] = [
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
const rav4Cases: Omit<DemoCase, "startingVehicleId" | "startingVin" | "replacementVehicleId">[] = [
  {
    id: "rav4-stay", title: "Keep the RAV4 for driving and cargo", expectedVerdict: "keep", todayISO: demoTodayISO,
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
    purpose: "Keeping the RAV4 satisfies cargo and efficiency needs despite the potential savings from a smaller Camry.",
  },
  {
    id: "rav4-switch", title: "Less driving, switch to a Camry", expectedVerdict: "replace", todayISO: demoTodayISO,
    descriptions: [
      "I drive 6,000 miles a year.",
      "My annual mileage is 6k.",
      "I am driving about 6000 miles per year.",
      "MY YEARLY MILEAGE IS 6000.",
    ],
    expectedEvents: [{ type: "mileage_change", month: 0, payload: { annualMiles: 6000 } }],
    replacementMonth: 12,
    purpose: "Low mileage and the fixed fictional RAV4 loan make switching to the less costly Camry worth investigating. Not a guaranteed refinance quote.",
  },
  {
    id: "rav4-close-call", title: "A cheaper Camry versus the RAV4's efficiency", expectedVerdict: "inconclusive", todayISO: demoTodayISO,
    descriptions: [
      "I drive 30,000 miles a year, and I pay $4 per gallon.",
      "My annual mileage is 30k; fuel costs $4 a gallon.",
      "I am driving about 30000 miles per year. Gas is $4 per gallon.",
      "MY YEARLY MILEAGE IS 30000. I PAY $4 PER GALLON.",
    ],
    expectedEvents: [
      { type: "mileage_change", month: 0, payload: { annualMiles: 30000 } },
      { type: "fuel_price_change", month: 0, payload: { fuelPricePerGal: 4 } },
    ],
    replacementMonth: 12,
    purpose: "Both options remain eligible: the Camry's lower modeled net cost competes with the RAV4's fuel economy and remaining life. A genuine score-margin close call.",
  },
];
const cases: DemoCase[] = [
  ...camryCases.map(demo => ({ ...demo, startingVehicleId: "camry-2022-se" as const,
    startingVin: demoStartingVins["camry-2022-se"], replacementVehicleId: "rav4-2024-hybrid-xle" as const })),
  ...rav4Cases.map(demo => ({ ...demo, startingVehicleId: "rav4-2024-hybrid-xle" as const,
    startingVin: demoStartingVins["rav4-2024-hybrid-xle"], replacementVehicleId: "camry-2022-se" as const })),
];
/** Fresh copies; optional starting-car filter only selects test inputs, never computed winners. */
export function getDemoCases(vehicleId?: DemoVehicleId): DemoCase[] {
  return structuredClone(cases.filter(demo => vehicleId === undefined || demo.startingVehicleId === vehicleId));
}
