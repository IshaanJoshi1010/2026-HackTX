import type { Journey, JourneyBranch, JourneyEvent, VehicleSegment } from "./types";

// Hand-built Journeys for building and testing UI with no store. Alex's demo, written out: a mileage change now, a move
// to Denver in month 12 (the same month as the swap, on purpose: two things land on one month), a second child in month 32.
// The dollar figures are made up for fixtures and are not the engine's.

const camry = (from: number, to: number): VehicleSegment => ({ vehicleId: "camry-2022-se", name: "2022 Camry SE", model: "Camry", fromMonth: from, toMonth: to });
const rav4 = (from: number, to: number): VehicleSegment => ({ vehicleId: "rav4-2024-hybrid-xle", name: "2024 RAV4 Hybrid XLE", model: "RAV4", fromMonth: from, toMonth: to });

export const fixtureEvents: JourneyEvent[] = [
  { id: "miles", type: "mileage_change", kind: "life", month: 0, title: "20,000 miles a year", dateLabel: "Oct 2026", whenLabel: "Now", futures: ["keep", "switch"], certainty: "clear", quote: "driving 20,000 miles annually", assumptions: [], payload: { annualMiles: 20000 }, changed: false },
  { id: "move", type: "relocation", kind: "life", month: 12, title: "Move to Denver", dateLabel: "Oct 2027", whenLabel: "In 1 yr", futures: ["keep", "switch"], certainty: "clear", quote: "moving to Denver next year", assumptions: [], payload: { location: "Denver" }, changed: false },
  { id: "swap", type: "vehicle_replacement", kind: "swap", month: 12, title: "Switch to the RAV4", dateLabel: "Oct 2027", whenLabel: "In 1 yr", futures: ["switch"], certainty: "clear", assumptions: ["Replacement month 12 matches the first relocation or family change"], payload: { vehicleId: "rav4-2024-hybrid-xle" }, changed: false },
  { id: "kid", type: "family_change", kind: "life", month: 32, title: "Second child", dateLabel: "Jun 2029", whenLabel: "In 2 yr 8 mo", futures: ["keep", "switch"], certainty: "inferred", quote: "expecting my second child in 2029", assumptions: ["summer is represented by june 2027 using a US-season estimate; confirm or correct the start month."], payload: { children: 2 }, changed: false },
];

const keepBranch: JourneyBranch = {
  kind: "keep", scenarioId: "base/0-20-000-miles-a-year", title: "Keep your Camry", priced: true, splitMonth: null,
  segments: [camry(0, 60)], endVehicle: camry(0, 60), fiveYearCost: 31287, costSource: "illustrative", costThroughMonth: 18500, selected: true, verdict: "close",
};
const switchBranch: JourneyBranch = {
  kind: "switch", scenarioId: "base/0-20-000-miles-a-year/replace-rav4-2024-hybrid-xle-12", title: "Switch to the RAV4", priced: true, splitMonth: 12,
  segments: [camry(0, 12), rav4(12, 60)], endVehicle: rav4(12, 60), fiveYearCost: 35639, costSource: "illustrative", costThroughMonth: 21000, selected: false, verdict: "close",
};

const base: Journey = {
  revision: 3, updating: false, horizon: 60, month: 0, monthLabel: "Oct 2026", selectedFuture: "keep", selectedEventId: null,
  events: fixtureEvents, keep: keepBranch, switch: switchBranch, vehicleNow: camry(0, 60),
  difference: { amount: 4352, phrase: "Switching adds $4,352", source: "illustrative" },
  stops: [0, 12, 32], call: "close",
};

/** Keeping and switching both priced: the compared state. */
export const journeyCompared: Journey = base;

/** Nothing compared yet: the switch is a dashed offer with no cost, and the engine has no call. */
export const journeyOffer: Journey = {
  ...base,
  switch: { ...switchBranch, scenarioId: null, priced: false, fiveYearCost: null, costThroughMonth: null, costSource: undefined, verdict: null },
  keep: { ...keepBranch, verdict: null },
  events: fixtureEvents.filter((e) => e.kind === "life"),
  difference: null, call: null, stops: [0, 12, 32],
};

/** Looking at the switch future, past the swap, with the second child selected. */
export const journeySwitchSelected: Journey = {
  ...base, month: 32, monthLabel: "Jun 2029", selectedFuture: "switch", selectedEventId: "kid", vehicleNow: rav4(12, 60),
  keep: { ...keepBranch, selected: false }, switch: { ...switchBranch, selected: true },
};

/** Nothing said yet: no events, only the offer. */
export const journeyEmpty: Journey = { ...journeyOffer, events: [], stops: [0] };

/** A recommendation for switching, for the header. */
export const journeySwitchWins: Journey = {
  ...base, call: "switch",
  keep: { ...keepBranch, verdict: "alternative" }, switch: { ...switchBranch, verdict: "recommended" },
  difference: { amount: -2100, phrase: "Switching saves $2,100", source: "illustrative" },
};
