import type {
  DepreciationAssumptions, MaintenanceMilestone, MonthState, ProjectionPoint, Scenario, SimContext, SimulationResult, Source,
  SpecSheet, SuitabilityResult, VehicleConfig, VehicleTwin,
} from "../contracts";
import { DEFAULT_DEPRECIATION, EXPECTED_MILES_PER_YEAR, HORIZON_MONTHS, MILESTONE_MIN_INTERVAL_MILES, SIM_START_YEAR } from "./config";
import { mileageFactor, retainedFraction } from "./depreciation";
import { resolveStates, toMonthState } from "./events";
import { amortizeStep, impliedApr } from "./financing";
import { fuelCost } from "./fuel";
import { insurancePerMonth } from "./insurance";
import { dueBetween } from "./maintenance";
import { monthlyMiles } from "./mileage";
import { financedAmount, newLoanPayment, purchaseTerms, taxAndFees } from "./replacement";

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

interface Financing { kind: "loan" | "lease" | "none"; payment: number; apr: number; leaseMonths: number }

/**
 * The car owned right now. Its value is base * curve(age, odometer) / anchor: the starting car uses MSRP
 * with anchor 1; a purchased car is anchored so its value equals the purchase price at the instant of purchase.
 */
interface Car {
  vehicle: VehicleConfig; mpg: number; dep: DepreciationAssumptions; tasks: readonly MaintenanceMilestone[];
  base: number; anchor: number; age: number; odometer: number;
}

const curve = (dep: DepreciationAssumptions, age: number, odometer: number, scale: number) =>
  retainedFraction(dep, age, scale) * mileageFactor(dep, age, odometer);

function makeCar(vehicle: VehicleConfig, spec: SpecSheet | undefined, age: number, odometer: number,
  scale: number, warnings: string[], price?: number): Car {
  if (!spec) warnings.push(`No spec sheet for ${vehicle.id}; using default depreciation and no maintenance schedule`);
  const mpg = spec?.mpgCombined ?? vehicle.mpg;
  if (mpg <= 0) warnings.push(`No usable MPG for ${vehicle.id}; fuel spend shows as 0`);
  const dep = spec?.depreciation ?? DEFAULT_DEPRECIATION;
  return {
    vehicle, mpg, dep, tasks: spec?.maintenance ?? [], age, odometer,
    base: price ?? spec?.msrp ?? vehicle.msrp,
    anchor: price === undefined ? 1 : curve(dep, age, odometer, scale),
  };
}

const carValue = (c: Car, scale: number) => c.base * curve(c.dep, c.age, c.odometer, scale) / c.anchor;

function carAssumptions(c: Car, spec: SpecSheet | undefined, prefix: string): SimAssumption[] {
  const id = c.vehicle.id;
  return [
    { key: `${prefix}mpg`, value: c.mpg, source: spec?.sources.mpgCombined ?? "estimated", note: `Combined MPG for ${id}` },
    { key: `${prefix}depreciation`, value: c.dep.retainedByYear.join("/"), source: spec?.sources.depreciation ?? "illustrative",
      note: `${id}: retained fraction of MSRP after years 1..${c.dep.retainedByYear.length}, ${c.dep.mileageAdjPer10k} per 10k miles vs ${EXPECTED_MILES_PER_YEAR.toLocaleString("en-US")} mi/yr` },
    { key: `${prefix}maintenance`, value: c.tasks.length, source: spec?.sources.maintenance ?? "illustrative", note: `${id}: scheduled tasks from the spec sheet` },
  ];
}

function initialFinancing(twin: VehicleTwin, scenario: Scenario, warnings: string[], out: SimAssumption[]): { fin: Financing; balance: number } {
  const f = twin.finance;
  const none = { fin: { kind: "none" as const, payment: 0, apr: 0, leaseMonths: 0 }, balance: 0 };
  const type = twin.driver.financeType;
  if (type === "paid_off") {
    if (f.balance > 0) warnings.push("Finance marked paid off but has a balance; treating it as paid off");
    return none;
  }
  if (type === "lease") {
    const leaseMonths = Math.min(f.leaseEndMonth ?? f.remainingTermMonths, HORIZON_MONTHS);
    warnings.push(`Lease: the car is not owned, so its value shows as 0. No vehicle cost is modeled after month ${leaseMonths}`);
    out.push({ key: "leasePayment", value: f.monthlyPayment, source: f.provenance.monthlyPayment ?? "estimated", note: `Lease payment for ${leaseMonths} months` });
    return { fin: { kind: "lease", payment: f.monthlyPayment, apr: 0, leaseMonths }, balance: 0 };
  }
  if (f.balance <= 0) {
    if (type === "unknown") warnings.push("Finance type unknown and no balance on record; no loan payments modeled");
    return none;
  }
  if (type === "unknown") warnings.push("Finance type unknown; using the balance and payment on record as a loan");
  if (f.monthlyPayment <= 0 || f.remainingTermMonths <= 0) {
    warnings.push("Loan has a balance but no payment or term; the balance is carried with no payments");
    return { fin: { kind: "loan", payment: 0, apr: 0, leaseMonths: 0 }, balance: f.balance };
  }
  const entered = scenario.assumptions.loanApr;
  const apr = entered !== undefined && Number.isFinite(entered) && entered >= 0 ? entered : impliedApr(f.balance, f.monthlyPayment, f.remainingTermMonths);
  out.push({ key: "loanApr", value: apr, source: entered !== undefined ? "user" : "estimated",
    note: entered !== undefined ? "APR entered by user" : "APR implied by balance, payment and remaining term" });
  if (entered === undefined && f.monthlyPayment * f.remainingTermMonths <= f.balance) {
    warnings.push("Loan payments do not cover the balance at 0% APR; modeled at 0% and the balance may remain at the end");
  }
  return { fin: { kind: "loan", payment: f.monthlyPayment, apr, leaseMonths: 0 }, balance: f.balance };
}

/**
 * Deterministic monthly ownership projection over HORIZON_MONTHS. Pure: no I/O, no clock, no randomness,
 * inputs are never mutated. Points are end-of-month states for months 1..HORIZON_MONTHS.
 *
 * Accounting identity (see /sim/ECONOMICS.md):
 *   netEconomicCost_t = cumulativeCash_t + (loanBalance_t - loanBalance_0) - (vehicleValue_t - vehicleValue_0)
 * cumulativeCash is every dollar paid out minus sale proceeds. vehicleValue and loanBalance describe whichever
 * car is owned at month t. Principal nets to zero, so the real costs are fuel, maintenance, insurance,
 * interest, tax and fees, and depreciation. A replacement at month m happens at the start of month m:
 * sell the current car at its modeled value, pay off what is owed, then buy (down payment plus tax and fees
 * in cash, the rest financed). At that instant net cost rises by exactly the tax and fees.
 */
export function simulateDetailed(twin: VehicleTwin, scenario: Scenario, ctx: SimContext): DetailedSimulation {
  const { states, warnings } = resolveStates(twin, scenario);
  const assumptions: SimAssumption[] = [];
  const milestones: string[] = [];
  const a = scenario.assumptions;
  const startYear = a.startYear ?? SIM_START_YEAR;
  const scale = a.depreciationScale ?? 1;
  const insurance = insurancePerMonth(a);

  const startVehicle = ctx.vehicles[twin.vehicle.id] ?? twin.vehicle;
  const startSpec = ctx.specs[startVehicle.id];
  let car = makeCar(startVehicle, startSpec, Math.max(0, startYear - startVehicle.year), twin.mileage, scale, warnings);
  assumptions.push(
    ...carAssumptions(car, startSpec, ""),
    { key: "msrp", value: car.base, source: startSpec?.sources.msrp ?? "estimated", note: "Base for the retained-value curve" },
    { key: "insurancePerMonth", value: insurance.value, source: insurance.source, note: "Monthly insurance" },
    { key: "startYear", value: startYear, source: a.startYear !== undefined ? "user" : "illustrative", note: "Calendar year at month 0, sets vehicle age" },
    { key: "annualMiles", value: twin.driver.annualMiles, source: twin.driver.provenance.annualMiles ?? "estimated", note: "Starting annual miles" },
    { key: "fuelPricePerGal", value: twin.driver.fuelPricePerGal, source: twin.driver.provenance.fuelPricePerGal ?? "estimated", note: "Starting fuel price" },
  );
  if (scale !== 1) assumptions.push({ key: "depreciationScale", value: scale, source: "illustrative", note: "Sensitivity multiplier on value lost" });

  const init = initialFinancing(twin, scenario, warnings, assumptions);
  let fin = init.fin;
  let loan = init.balance;
  let owned = fin.kind !== "lease";
  const value0 = owned ? carValue(car, scale) : 0;
  const loan0 = loan;
  let cash = 0;
  let budgetWarned = false;
  const missing = new Set<string>();
  const points: ProjectionPoint[] = [];

  for (const s of states) {
    const m = s.month;

    if (s.vehicleId !== car.vehicle.id && !missing.has(s.vehicleId)) {
      const next = ctx.vehicles[s.vehicleId];
      if (!next) {
        warnings.push(`Vehicle ${s.vehicleId} is not in the simulation context; the replacement is not modeled`);
        missing.add(s.vehicleId);
      } else {
        // Sell or trade in: proceeds lower cash, payoff raises it. Neutral to net cost at this instant.
        const proceeds = owned ? carValue(car, scale) : 0;
        const leaseLeft = fin.kind === "lease" ? fin.payment * Math.max(0, fin.leaseMonths - (m - 1)) : 0;
        cash += loan - proceeds + leaseLeft;
        milestones.push(owned
          ? `Month ${m}: sell or trade in the ${car.vehicle.model} for ${usd(proceeds)} (modeled value, illustrative)${loan > 0 ? ` and pay off ${usd(loan)}` : ""}`
          : `Month ${m}: end the ${car.vehicle.model} lease${leaseLeft > 0 ? `, ${usd(leaseLeft)} of remaining payments` : ""}`);
        if (loan > proceeds && owned) warnings.push(`Month ${m}: negative equity of ${usd(loan - proceeds)} paid at trade-in`);
        if (leaseLeft > 0) warnings.push(`Month ${m}: early lease exit modeled as paying the remaining ${usd(leaseLeft)}`);

        // Buy: down payment plus tax and fees in cash, the rest financed.
        const spec = ctx.specs[next.id];
        const age = Math.max(0, startYear + (m - 1) / 12 - next.year);
        const odoEntered = s.replacement?.mileage;
        const odometer = odoEntered ?? Math.round(EXPECTED_MILES_PER_YEAR * age);
        const probe = makeCar(next, spec, age, odometer, scale, []);
        const terms = purchaseTerms(a, s.replacement?.price, carValue(probe, scale), "estimated");
        car = makeCar(next, spec, age, odometer, scale, warnings, terms.price);
        loan = financedAmount(terms);
        fin = { kind: loan > 0 ? "loan" : "none", payment: newLoanPayment(terms), apr: terms.apr, leaseMonths: 0 };
        owned = true;
        cash += terms.downPayment + taxAndFees(terms);
        milestones.push(`Month ${m}: buy the ${next.year} ${next.model} ${next.trim} for ${usd(terms.price)} plus ${usd(taxAndFees(terms))} tax and fees`);
        assumptions.push(
          ...carAssumptions(car, spec, "replacement."),
          { key: "replacement.price", value: terms.price, source: terms.sources.price,
            note: terms.sources.price === "estimated" ? "Modeled market value at purchase; pass a listing price to override" : "Purchase price" },
          { key: "replacement.mileage", value: odometer, source: odoEntered !== undefined ? "user" : "illustrative", note: `Odometer at purchase, month ${m}` },
          { key: "replacement.salesTaxRate", value: terms.salesTaxRate, source: terms.sources.salesTaxRate, note: "Sales tax on price" },
          { key: "replacement.fees", value: terms.fees, source: terms.sources.fees, note: "Title, registration and dealer fees" },
          { key: "replacement.downPayment", value: terms.downPayment, source: terms.sources.downPayment, note: "Cash down, before tax and fees" },
          { key: "replacement.apr", value: terms.apr, source: terms.sources.apr, note: "New loan APR" },
          { key: "replacement.termMonths", value: terms.termMonths, source: terms.sources.termMonths, note: "New loan term" },
        );
      }
    }

    const miles = monthlyMiles(s.annualMiles);
    const before = car.odometer;
    car.odometer += miles;
    const fuelSpend = fuelCost(miles, car.mpg, s.fuelPricePerGal);

    let maintenanceSpend = 0;
    for (const due of dueBetween(car.tasks, before, car.odometer)) {
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

    car.age += 1 / 12;
    const recurring = fuelSpend + insurance.value + financePaid;
    if (s.monthlyBudget !== undefined && recurring > s.monthlyBudget && !budgetWarned) {
      warnings.push(`Month ${m}: monthly cost ${usd(recurring)} is over the ${usd(s.monthlyBudget)} budget`);
      budgetWarned = true;
    }
    cash += recurring + maintenanceSpend;
    const value = owned ? carValue(car, scale) : 0;
    points.push({
      month: m, vehicleId: car.vehicle.id, mileage: car.odometer, fuelSpend, maintenanceSpend,
      vehicleValue: value, loanBalance: loan, cumulativeCash: cash,
      netEconomicCost: cash + (loan - loan0) - (value - value0),
      suitability: pendingSuitability(),
    });
  }

  const last = points[points.length - 1];
  return {
    result: { scenarioId: scenario.id, points, milestones, warnings, summary: { totalCash: last.cumulativeCash, netCost: last.netEconomicCost } },
    assumptions, timeline: states.map(toMonthState),
  };
}

export function simulate(twin: VehicleTwin, scenario: Scenario, ctx: SimContext): SimulationResult {
  return simulateDetailed(twin, scenario, ctx).result;
}
