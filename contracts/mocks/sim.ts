import type {
  BreakEvenResult, DecisionEvaluation, DriverProfile, LifeEvent, NextAction, ProjectionPoint, Scenario,
  SensitivityResult, SimContext, SimulationResult, SuitabilityResult, VehicleTwin,
} from "../index";

// Dev 4 S0 mocks. Every number is illustrative: a simplified formula keeps the curves consistent
// with the accounting identity in /sim/ECONOMICS.md, but this is not the real engine in /sim.
// Each mock shares the signature of the real export so Dev 2 can flip USE_MOCKS.

const HORIZON_MONTHS = 60;
const START_MILES = 48000;

interface MockCar { id: string; price: number; mpg: number; insurancePerMonth: number; ageYears0: number }
const CAMRY: MockCar = { id: "camry-2022-se", price: 28000, mpg: 32, insurancePerMonth: 120, ageYears0: 4 };
const RAV4: MockCar = { id: "rav4-2024-hybrid-xle", price: 33000, mpg: 39, insurancePerMonth: 135, ageYears0: 0 };
const RETAINED_BY_YEAR = [1, 0.85, 0.75, 0.67, 0.6, 0.54]; // index = age in years
const CAMRY_LOAN = { balance: 15000, payment: 450, apr: 0.05 };
const RAV4_PURCHASE = { downPayment: 5000, apr: 0.06, termMonths: 60, taxRate: 0.0625, fees: 450 };

interface Branch { kind: "baseline" | "denver" | "replace"; deprScale: number; fuelScale: number }

const round2 = (n: number) => Math.round(n * 100) / 100;

function retained(ageYears: number): number {
  if (ageYears >= 5) return Math.max(0.1, RETAINED_BY_YEAR[5] - 0.05 * (ageYears - 5));
  const i = Math.floor(ageYears);
  return RETAINED_BY_YEAR[i] + (RETAINED_BY_YEAR[i + 1] - RETAINED_BY_YEAR[i]) * (ageYears - i);
}

function carValue(car: MockCar, ageYears: number, odometer: number, deprScale: number): number {
  const base = car.price * (1 - (1 - retained(ageYears)) * deprScale);
  const mileageAdj = 1 - 0.02 * (odometer - 12000 * ageYears) / 10000; // vs 12k mi/yr expected
  return Math.max(0, base * mileageAdj);
}

function payment(principal: number, apr: number, months: number): number {
  const r = apr / 12;
  return principal * r / (1 - (1 + r) ** -months);
}

const placeholderSuitability = (): SuitabilityResult => ({
  passengerFit: "needs_verification", cargoFit: "needs_verification", tradeoffs: [], constraints: [],
  notes: ["Mock: real suitability arrives in S4"],
});

function project(scenarioId: string, b: Branch, baseFuelPrice: number): SimulationResult {
  const moved = b.kind !== "baseline";
  const replaceAt = b.kind === "replace" ? 12 : undefined;
  let car = CAMRY, ageYears = CAMRY.ageYears0, odometer = START_MILES;
  let loan = CAMRY_LOAN.balance, loanPayment = CAMRY_LOAN.payment, apr = CAMRY_LOAN.apr;
  let cash = 0;
  const value0 = carValue(CAMRY, ageYears, odometer, b.deprScale), loan0 = loan;
  const points: ProjectionPoint[] = [], milestones: string[] = [];

  for (let month = 1; month <= HORIZON_MONTHS; month++) {
    if (month === replaceAt) {
      const proceeds = carValue(car, ageYears, odometer, b.deprScale);
      const p = RAV4.price, f = p * RAV4_PURCHASE.taxRate + RAV4_PURCHASE.fees;
      cash += loan - proceeds + RAV4_PURCHASE.downPayment + f;
      car = RAV4; ageYears = RAV4.ageYears0; odometer = 0;
      loan = p - RAV4_PURCHASE.downPayment; apr = RAV4_PURCHASE.apr;
      loanPayment = payment(loan, apr, RAV4_PURCHASE.termMonths);
      milestones.push(`Month ${month}: trade in Camry, buy RAV4 Hybrid (illustrative price and fees)`);
    }
    if (moved && month === 12) milestones.push("Month 12: move to Denver, 20,000 mi/yr");
    if (moved && month === 30) milestones.push("Month 30: second child");

    const annualMiles = moved && month >= 12 ? 20000 : 12000;
    const fuelPrice = (moved && month >= 12 ? 3.4 : baseFuelPrice) * b.fuelScale;
    const miles = annualMiles / 12;
    const before = odometer;
    odometer += miles;
    const fuelSpend = miles / car.mpg * fuelPrice;
    let maintenanceSpend = Math.floor(odometer / 5000) > Math.floor(before / 5000) ? 100 : 0;
    if (Math.floor(odometer / 60000) > Math.floor(before / 60000)) {
      maintenanceSpend += 600;
      milestones.push(`Month ${month}: major service at ${Math.round(odometer).toLocaleString("en-US")} mi`);
    }
    let loanPaid = 0;
    if (loan > 0) {
      const interest = loan * apr / 12;
      const principal = Math.min(loanPayment - interest, loan);
      loan -= principal; loanPaid = interest + principal;
      if (loan < 0.005) { loan = 0; milestones.push(`Month ${month}: loan paid off`); }
    }
    ageYears += 1 / 12;
    cash += fuelSpend + maintenanceSpend + car.insurancePerMonth + loanPaid;
    const vehicleValue = carValue(car, ageYears, odometer, b.deprScale);
    // netEconomicCost_t = cumulativeCash_t + (loanBalance_t - loanBalance_0) - (vehicleValue_t - vehicleValue_0)
    const net = cash + (loan - loan0) - (vehicleValue - value0);
    points.push({
      month, vehicleId: car.id, mileage: Math.round(odometer), fuelSpend: round2(fuelSpend),
      maintenanceSpend, vehicleValue: round2(vehicleValue), loanBalance: round2(loan),
      cumulativeCash: round2(cash), netEconomicCost: round2(net), suitability: placeholderSuitability(),
    });
  }
  const last = points[points.length - 1];
  return {
    scenarioId, points, milestones,
    warnings: ["Mock simulation: all values illustrative"],
    summary: { totalCash: last.cumulativeCash, netCost: last.netEconomicCost },
  };
}

const event = (id: string, type: LifeEvent["type"], month: number, payload: LifeEvent["payload"]): LifeEvent => ({
  id, type, month, payload, source: "fixture", assumptions: ["illustrative mock event"], certainty: "clear", status: "confirmed",
});

export const mockScenarios: Scenario[] = [
  { id: "baseline", parentId: null, forkMonth: 0, name: "Keep Camry", events: [], assumptions: {} },
  { id: "denver", parentId: "baseline", forkMonth: 12, name: "Denver move", assumptions: {}, events: [
    event("evt-relocation", "relocation", 12, { location: "Denver, CO", fuelPricePerGal: 3.4 }),
    event("evt-miles", "mileage_change", 12, { annualMiles: 20000 }),
    event("evt-family", "family_change", 30, { children: 2, householdSize: 4, carSeats: 2 }),
  ] },
  { id: "replace-rav4", parentId: "denver", forkMonth: 12, name: "Replace with RAV4 Hybrid", assumptions: {}, events: [
    event("evt-relocation", "relocation", 12, { location: "Denver, CO", fuelPricePerGal: 3.4 }),
    event("evt-miles", "mileage_change", 12, { annualMiles: 20000 }),
    event("evt-replace", "vehicle_replacement", 12, { vehicleId: RAV4.id }),
    event("evt-family", "family_change", 30, { children: 2, householdSize: 4, carSeats: 2 }),
  ] },
];

function branchKind(s: Scenario): Branch["kind"] {
  if (s.events.some(e => e.status === "confirmed" && e.type === "vehicle_replacement")) return "replace";
  if (s.events.some(e => e.status === "confirmed" && (e.type === "relocation" || e.type === "mileage_change"))) return "denver";
  return "baseline";
}

const runMock = (s: Scenario, fuelPrice: number, deprScale = 1, fuelScale = 1) =>
  project(s.id, { kind: branchKind(s), deprScale, fuelScale }, fuelPrice);

/** Baseline plus two branches, 60 monthly points each. Keyed by scenario id. */
export const mockSimulationResults: Record<string, SimulationResult> = Object.fromEntries(
  mockScenarios.map(s => [s.id, runMock(s, 3)]));

/** simulate-compatible mock. Picks a curve by the scenario's confirmed events. */
export function mockSimulationResult(twin: VehicleTwin, scenario: Scenario, _ctx: SimContext): SimulationResult {
  void _ctx;
  return runMock(scenario, twin.driver.fuelPricePerGal);
}

function lowestNetCost(results: SimulationResult[]): string | "inconclusive" {
  if (results.length === 0) return "inconclusive";
  return [...results].sort((a, b) => a.summary.netCost - b.summary.netCost)[0].scenarioId;
}

const SENS_CASES = [
  { label: "low" as const, deprScale: 0.8, fuelScale: 0.8 },
  { label: "base" as const, deprScale: 1, fuelScale: 1 },
  { label: "high" as const, deprScale: 1.2, fuelScale: 1.25 },
];

/** sensitivity-compatible mock: three runs, robustness as a count, never a percentage. */
export function mockSensitivity(a: { twin: VehicleTwin; scenarios: Scenario[]; ctx: SimContext;
  priorities: DriverProfile["priorities"] }): SensitivityResult {
  const base = a.twin.driver.fuelPricePerGal;
  const runs = SENS_CASES.map(c => {
    const results = a.scenarios.map(s => runMock(s, base, c.deprScale, c.fuelScale));
    return { label: c.label, depreciation: c.deprScale, fuelPrice: round2(base * c.fuelScale),
      netCost: Object.fromEntries(results.map(r => [r.scenarioId, r.summary.netCost])), winner: lowestNetCost(results) };
  });
  const baseWinner = runs[1].winner;
  return {
    runs: runs.map(({ winner, ...run }) => { void winner; return run; }),
    heldCount: runs.filter(r => r.winner === baseWinner).length, totalCount: runs.length, heldScenarioId: baseWinner,
  };
}

/** evaluate-compatible mock. Prefers the lowest net cost; the real one weighs priorities. */
export function mockEvaluation(a: { twin: VehicleTwin; scenarios: Scenario[]; results: SimulationResult[];
  priorities: DriverProfile["priorities"]; maxMonthlyBudget?: number }): DecisionEvaluation {
  const preferredScenarioId = lowestNetCost(a.results);
  const sens = mockSensitivity({ twin: a.twin, scenarios: a.scenarios, ctx: { vehicles: {}, specs: {} }, priorities: a.priorities });
  const fmt = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
  return {
    scenarioIds: a.results.map(r => r.scenarioId),
    hardConstraints: [],
    preferredScenarioId,
    rationale: [
      "Mock: preferred scenario is the lowest 5-year net economic cost; the real evaluate weighs your priorities",
      ...a.results.map(r => `${r.scenarioId}: net cost ${fmt(r.summary.netCost)}, cash out ${fmt(r.summary.totalCash)} (illustrative)`),
      `Held in ${sens.heldCount} of ${sens.totalCount} tested cases`,
    ],
    sensitivity: a.scenarios.map(s => {
      const [low, base, high] = sens.runs.map(r => r.netCost[s.id]);
      return { low, base, high };
    }),
    nextAction: { label: "Mock next action", detail: "Placeholder until nextAction ships at hour 15" },
  };
}

/** Both break-even shapes, for rendering the found and not-found states. */
export const mockBreakEvenFound: Extract<BreakEvenResult, { found: true }> = {
  found: true, parameter: "annualMiles", threshold: 17400, unit: "mi/yr", direction: "above",
  currentValue: 12000, testedBounds: [5000, 40000],
};
export const mockBreakEvenNotFound: BreakEvenResult = {
  found: false, parameter: "fuelPricePerGal", reason: "no_threshold_within_bounds", testedBounds: [2, 8],
};

/** findBreakEven-compatible mock: annualMiles finds a threshold, fuelPricePerGal does not. */
export function mockBreakEven(a: { twin: VehicleTwin; keep: Scenario; replace: Scenario;
  parameter: "annualMiles" | "fuelPricePerGal"; ctx: SimContext; priorities: DriverProfile["priorities"] }): BreakEvenResult {
  return a.parameter === "annualMiles"
    ? { ...mockBreakEvenFound, currentValue: a.twin.driver.annualMiles }
    : { ...mockBreakEvenNotFound };
}

/** nextAction-compatible mock. Never implies a booking or approval happened. */
export function mockNextAction(e: DecisionEvaluation, _twin: VehicleTwin, be?: BreakEvenResult): NextAction {
  void _twin;
  if (e.preferredScenarioId === "inconclusive") {
    const at = be?.found ? ` at ${Math.round(be.threshold).toLocaleString("en-US")} ${be.unit}` : "";
    return { label: "Reevaluate later", detail: `Mock: reevaluate${at}.`, factors: ["break_even"] };
  }
  if (e.preferredScenarioId === "replace-rav4") {
    return { label: "Investigate a RAV4 Hybrid", detail: "Mock: lower modeled net cost at higher mileage.", factors: ["net_cost", "fuel"] };
  }
  return { label: "Keep your car", detail: "Mock: review the next scheduled maintenance milestone.", factors: ["net_cost"] };
}
