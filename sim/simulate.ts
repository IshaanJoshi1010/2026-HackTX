import type {
  DepreciationAssumptions, MonthState, ProjectionPoint, Scenario, SimContext, SimulationResult, Source, SuitabilityResult, VehicleTwin,
} from "../contracts";
import { DEFAULT_DEPRECIATION, EXPECTED_MILES_PER_YEAR, HORIZON_MONTHS, MILESTONE_MIN_INTERVAL_MILES, SIM_START_YEAR } from "./config";
import { vehicleValue } from "./depreciation";
import { resolveStates } from "./events";
import { amortizeStep, impliedApr } from "./financing";
import { fuelCost } from "./fuel";
import { insurancePerMonth } from "./insurance";
import { dueBetween } from "./maintenance";
import { monthlyMiles } from "./mileage";

/** One labeled input the projection relied on. Every displayed number traces back to one of these. */
export interface SimAssumption { key: string; value: number | string; source: Source; note: string }
export interface DetailedSimulation { result: SimulationResult; assumptions: SimAssumption[]; timeline: MonthState[] }

// Placeholder until assessSuitability lands (S4).
const pendingSuitability = (): SuitabilityResult => ({
  passengerFit: "needs_verification", cargoFit: "needs_verification", tradeoffs: [], constraints: [],
  notes: ["suitability_pending"],
});

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const mi = (n: number) => `${Math.round(n).toLocaleString("en-US")} mi`;

interface Financing { kind: "loan" | "lease" | "none"; balance: number; payment: number; apr: number; leaseMonths: number }

function initialFinancing(twin: VehicleTwin, scenario: Scenario, warnings: string[], out: SimAssumption[]): Financing {
  const f = twin.finance;
  const none: Financing = { kind: "none", balance: 0, payment: 0, apr: 0, leaseMonths: 0 };
  const type = twin.driver.financeType;
  if (type === "paid_off") {
    if (f.balance > 0) warnings.push("Finance marked paid off but has a balance; treating it as paid off");
    return none;
  }
  if (type === "lease") {
    const leaseMonths = Math.min(f.leaseEndMonth ?? f.remainingTermMonths, HORIZON_MONTHS);
    warnings.push(`Lease: the car is not owned, so its value shows as 0. No vehicle cost is modeled after month ${leaseMonths}`);
    out.push({ key: "leasePayment", value: f.monthlyPayment, source: f.provenance.monthlyPayment ?? "estimated", note: `Lease payment for ${leaseMonths} months` });
    return { kind: "lease", balance: 0, payment: f.monthlyPayment, apr: 0, leaseMonths };
  }
  if (f.balance <= 0) {
    if (type === "unknown") warnings.push("Finance type unknown and no balance on record; no loan payments modeled");
    return none;
  }
  if (type === "unknown") warnings.push("Finance type unknown; using the balance and payment on record as a loan");
  if (f.monthlyPayment <= 0 || f.remainingTermMonths <= 0) {
    warnings.push("Loan has a balance but no payment or term; the balance is carried with no payments");
    return { kind: "loan", balance: f.balance, payment: 0, apr: 0, leaseMonths: 0 };
  }
  const entered = scenario.assumptions.loanApr;
  const apr = entered !== undefined && Number.isFinite(entered) && entered >= 0 ? entered : impliedApr(f.balance, f.monthlyPayment, f.remainingTermMonths);
  out.push({ key: "loanApr", value: apr, source: entered !== undefined ? "user" : "estimated",
    note: entered !== undefined ? "APR entered by user" : "APR implied by balance, payment and remaining term" });
  if (entered === undefined && f.monthlyPayment * f.remainingTermMonths <= f.balance) {
    warnings.push("Loan payments do not cover the balance at 0% APR; modeled at 0% and the balance may remain at the end");
  }
  return { kind: "loan", balance: f.balance, payment: f.monthlyPayment, apr, leaseMonths: 0 };
}

/**
 * Deterministic monthly ownership projection over HORIZON_MONTHS. Pure: no I/O, no clock, no randomness,
 * inputs are never mutated. Points are end-of-month states for months 1..HORIZON_MONTHS.
 *
 * Accounting identity (see /sim/ECONOMICS.md):
 *   netEconomicCost_t = cumulativeCash_t + (loanBalance_t - loanBalance_0) - (vehicleValue_t - vehicleValue_0)
 * cumulativeCash is every dollar paid out minus sale proceeds; principal nets to zero, so the real costs
 * are fuel, maintenance, insurance, interest, fees and depreciation.
 */
export function simulateDetailed(twin: VehicleTwin, scenario: Scenario, ctx: SimContext): DetailedSimulation {
  const { states, warnings } = resolveStates(twin, scenario);
  const assumptions: SimAssumption[] = [];
  const milestones: string[] = [];
  const a = scenario.assumptions;

  const vehicle = ctx.vehicles[twin.vehicle.id] ?? twin.vehicle;
  const spec = ctx.specs[vehicle.id];
  const mpg = spec?.mpgCombined ?? vehicle.mpg;
  if (mpg <= 0) warnings.push(`No usable MPG for ${vehicle.id}; fuel spend shows as 0`);
  const dep: DepreciationAssumptions = spec?.depreciation ?? DEFAULT_DEPRECIATION;
  const tasks = spec?.maintenance ?? [];
  if (!spec) warnings.push(`No spec sheet for ${vehicle.id}; using default depreciation and no maintenance schedule`);
  const msrp = spec?.msrp ?? vehicle.msrp;
  const startYear = a.startYear ?? SIM_START_YEAR;
  const depScale = a.depreciationScale ?? 1;
  const insurance = insurancePerMonth(a);

  assumptions.push(
    { key: "mpg", value: mpg, source: spec?.sources.mpgCombined ?? "estimated", note: `Combined MPG for ${vehicle.id}` },
    { key: "msrp", value: msrp, source: spec?.sources.msrp ?? "estimated", note: "Base for the retained-value curve" },
    { key: "depreciation", value: dep.retainedByYear.join("/"), source: spec?.sources.depreciation ?? "illustrative",
      note: `Retained fraction of MSRP after years 1..${dep.retainedByYear.length}, ${dep.mileageAdjPer10k} per 10k miles vs ${EXPECTED_MILES_PER_YEAR.toLocaleString("en-US")} mi/yr` },
    { key: "maintenance", value: tasks.length, source: spec?.sources.maintenance ?? "illustrative", note: "Scheduled tasks from the spec sheet" },
    { key: "insurancePerMonth", value: insurance.value, source: insurance.source, note: "Monthly insurance" },
    { key: "startYear", value: startYear, source: a.startYear !== undefined ? "user" : "illustrative", note: "Calendar year at month 0, sets vehicle age" },
    { key: "annualMiles", value: twin.driver.annualMiles, source: twin.driver.provenance.annualMiles ?? "estimated", note: "Starting annual miles" },
    { key: "fuelPricePerGal", value: twin.driver.fuelPricePerGal, source: twin.driver.provenance.fuelPricePerGal ?? "estimated", note: "Starting fuel price" },
  );
  if (depScale !== 1) assumptions.push({ key: "depreciationScale", value: depScale, source: "illustrative", note: "Sensitivity multiplier on value lost" });

  const fin = initialFinancing(twin, scenario, warnings, assumptions);
  let age = Math.max(0, startYear - vehicle.year);
  let odometer = twin.mileage;
  let loan = fin.balance;
  const owned = fin.kind !== "lease";
  const value0 = owned ? vehicleValue(msrp, dep, age, odometer, depScale) : 0;
  const loan0 = loan;
  let cash = 0;
  let replacementWarned = false, budgetWarned = false;
  const points: ProjectionPoint[] = [];

  for (const s of states) {
    const m = s.month;
    if (s.vehicleId !== vehicle.id && !replacementWarned) {
      warnings.push(`Vehicle replacement to ${s.vehicleId} at month ${m} is not modeled yet; projecting the current car`);
      replacementWarned = true;
    }
    const miles = monthlyMiles(s.annualMiles);
    const before = odometer;
    odometer += miles;
    const fuelSpend = fuelCost(miles, mpg, s.fuelPricePerGal);

    let maintenanceSpend = 0;
    for (const due of dueBetween(tasks, before, odometer)) {
      maintenanceSpend += due.task.costUsd;
      if ((due.task.repeatEveryMiles ?? Infinity) >= MILESTONE_MIN_INTERVAL_MILES) {
        milestones.push(`Month ${m}: ${due.task.label} at ${mi(due.atMiles)} (${usd(due.task.costUsd)}, illustrative)`);
      }
    }

    let financePaid = 0;
    if (fin.kind === "loan" && loan > 0) {
      const step = amortizeStep(loan, fin.apr, fin.payment);
      financePaid = step.paid;
      loan = step.balance;
      if (loan === 0) milestones.push(`Month ${m}: loan paid off`);
    } else if (fin.kind === "lease" && m <= fin.leaseMonths) {
      financePaid = fin.payment;
      if (m === fin.leaseMonths) milestones.push(`Month ${m}: lease ends`);
    }

    age += 1 / 12;
    const recurring = fuelSpend + insurance.value + financePaid;
    if (s.monthlyBudget !== undefined && recurring > s.monthlyBudget && !budgetWarned) {
      warnings.push(`Month ${m}: monthly cost ${usd(recurring)} is over the ${usd(s.monthlyBudget)} budget`);
      budgetWarned = true;
    }
    cash += recurring + maintenanceSpend;
    const value = owned ? vehicleValue(msrp, dep, age, odometer, depScale) : 0;
    points.push({
      month: m, vehicleId: vehicle.id, mileage: odometer, fuelSpend, maintenanceSpend,
      vehicleValue: value, loanBalance: loan, cumulativeCash: cash,
      netEconomicCost: cash + (loan - loan0) - (value - value0),
      suitability: pendingSuitability(),
    });
  }

  const last = points[points.length - 1];
  const timeline = states.map(({ location: _l, carSeats: _c, commuteMilesOneWay: _o, commuteDaysPerWeek: _d, ...ms }) => {
    void _l; void _c; void _o; void _d;
    return ms;
  });
  return {
    result: { scenarioId: scenario.id, points, milestones, warnings, summary: { totalCash: last.cumulativeCash, netCost: last.netEconomicCost } },
    assumptions, timeline,
  };
}

export function simulate(twin: VehicleTwin, scenario: Scenario, ctx: SimContext): SimulationResult {
  return simulateDetailed(twin, scenario, ctx).result;
}
