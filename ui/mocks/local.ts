/**
 * LOCAL STUBS. Throwaway stand-ins for module functions that have not landed.
 * Each block says which developer owns the real one and what replaces it.
 * Signatures match /contracts/INTERFACES.md exactly.
 *
 * Nothing here is a real result. The MOCK banner is on whenever a stub is live.
 */
import type {
  BreakEvenResult,
  DecisionEvaluation,
  DriverProfile,
  HistoryRecord,
  LifeEvent,
  MaintenanceMilestone,
  NextAction,
  Scenario,
  SensitivityResult,
  SimContext,
  SimulationResult,
  SpecSheet,
  SuitabilityResult,
  TradeoffPick,
  VehicleConfig,
  VehicleTwin,
  ProjectionPoint,
} from "@/contracts";

// ---------------------------------------------------------------------------
// Dev 3 (Paarth): validateVin, identifyVehicle, mapTradeoffs, getHistory.
// Replaced when the real /data module lands (h6 to h8).
// ---------------------------------------------------------------------------

export type VinCheck =
  | { ok: true; vin: string }
  | { ok: false; reason: "length" | "chars" | "forbidden_letter" | "check_digit" };

/** Length, characters, forbidden letters. The check digit is NOT verified here. */
export function validateVin(input: string): VinCheck {
  const vin = input.trim().toUpperCase();
  if (vin.length !== 17) return { ok: false, reason: "length" };
  if (!/^[A-Z0-9]+$/.test(vin)) return { ok: false, reason: "chars" };
  if (/[IOQ]/.test(vin)) return { ok: false, reason: "forbidden_letter" };
  return { ok: true, vin };
}

/** No sample VINs are seeded yet, so every VIN is honestly "not decoded". */
export async function identifyVehicle(_vin: string) {
  void _vin;
  return {
    status: "unsupported" as const,
    partial: {},
    reason: "The VIN decoder has not landed yet. Pick a sample car.",
  };
}

const PAIR_DIMS: Record<TradeoffPick["pairId"], [keyof DriverProfile["priorities"], keyof DriverProfile["priorities"]]> = {
  cost_vs_cargo: ["cost", "family"],
  longevity_vs_fuel: ["longevity", "fuel"],
  comfort_vs_cost: ["comfort", "cost"],
};

/** Starts equal, moves 0.1 toward each pick, renormalizes to sum 1. */
export function mapTradeoffs(picks: TradeoffPick[]): DriverProfile["priorities"] {
  const w = { cost: 0.2, family: 0.2, longevity: 0.2, fuel: 0.2, comfort: 0.2 };
  for (const pick of picks) {
    const [a, b] = PAIR_DIMS[pick.pairId];
    w[pick.choice === "A" ? a : b] += 0.1;
  }
  const total = Object.values(w).reduce((x, y) => x + y, 0);
  return {
    cost: w.cost / total,
    family: w.family / total,
    longevity: w.longevity / total,
    fuel: w.fuel / total,
    comfort: w.comfort / total,
  };
}

export function getHistory(_vehicleId: string): HistoryRecord[] {
  void _vehicleId;
  return [];
}

// ---------------------------------------------------------------------------
// Dev 4 (Anirudh): simulate, fork, moveEvent, makeReplaceScenario.
// Replaced by the real /sim module (simulate h5, fork h8) or his /contracts/mocks.
// ---------------------------------------------------------------------------

const HORIZON_MONTHS = 60;
const SIM_WARNING =
  "MOCK sim: local stand-in, not Dev 4's simulate. Only vehicle_replacement events change the path.";

function retainedAt(spec: SpecSheet, month: number): number {
  const r = spec.depreciation.retainedByYear;
  const y = month / 12;
  const lo = Math.floor(y);
  const a = lo === 0 ? 1 : r[Math.min(lo - 1, r.length - 1)];
  const b = r[Math.min(lo, r.length - 1)];
  return a + (b - a) * (y - lo);
}

function serviceCostBetween(items: MaintenanceMilestone[], from: number, to: number): number {
  let cost = 0;
  for (const m of items) {
    const every = m.repeatEveryMiles;
    if (!every) {
      if (m.atMiles > from && m.atMiles <= to) cost += m.costUsd;
      continue;
    }
    const count = (x: number) => (x < m.atMiles ? 0 : Math.floor((x - m.atMiles) / every) + 1);
    cost += (count(to) - count(from)) * m.costUsd;
  }
  return cost;
}

const NEEDS_VERIFICATION: SuitabilityResult = {
  passengerFit: "needs_verification",
  cargoFit: "needs_verification",
  tradeoffs: [],
  constraints: [],
  notes: ["MOCK: fit is not computed yet."],
};

export function simulate(twin: VehicleTwin, scenario: Scenario, ctx: SimContext): SimulationResult {
  const replacement = scenario.events.find(
    (e) => e.type === "vehicle_replacement" && e.status === "confirmed",
  );
  const replaceMonth = replacement?.month ?? Number.POSITIVE_INFINITY;
  const toId = replacement ? String(replacement.payload.vehicleId) : twin.vehicle.id;
  const monthlyMiles = twin.driver.annualMiles / 12;
  const milestones: string[] = [];

  let activeId = twin.vehicle.id;
  let odometer = twin.mileage;
  let fuel = 0;
  let maintenance = 0;
  let cash = 0;
  let depreciation = 0;
  let ownedMonths = 0;
  let prevValue = ctx.specs[activeId].msrp;
  const points: ProjectionPoint[] = [];

  for (let m = 0; m <= HORIZON_MONTHS; m++) {
    if (m === replaceMonth && toId !== activeId) {
      const oldValue = ctx.specs[activeId].msrp * retainedAt(ctx.specs[activeId], ownedMonths);
      activeId = toId;
      odometer = 0;
      ownedMonths = 0;
      cash += ctx.specs[activeId].msrp - oldValue;
      prevValue = ctx.specs[activeId].msrp;
      milestones.push(`Month ${m}: replace with ${ctx.vehicles[activeId].model}`);
    } else if (m > 0) {
      ownedMonths += 1;
      const spec = ctx.specs[activeId];
      fuel += (monthlyMiles / spec.mpgCombined) * twin.driver.fuelPricePerGal;
      maintenance += serviceCostBetween(spec.maintenance, odometer, odometer + monthlyMiles);
      odometer += monthlyMiles;
      if (activeId === twin.vehicle.id && m <= twin.finance.remainingTermMonths) {
        cash += twin.finance.monthlyPayment;
        if (m === twin.finance.remainingTermMonths) milestones.push(`Month ${m}: loan paid off`);
      }
    }

    const spec = ctx.specs[activeId];
    const value = spec.msrp * retainedAt(spec, ownedMonths);
    depreciation += Math.max(0, prevValue - value);
    prevValue = value;
    const loanBalance =
      activeId === twin.vehicle.id
        ? Math.max(0, twin.finance.balance - twin.finance.monthlyPayment * m)
        : 0;

    points.push({
      month: m,
      vehicleId: activeId,
      mileage: odometer,
      fuelSpend: fuel,
      maintenanceSpend: maintenance,
      vehicleValue: value,
      loanBalance,
      cumulativeCash: cash + fuel + maintenance,
      netEconomicCost: fuel + maintenance + depreciation,
      suitability: NEEDS_VERIFICATION,
    });
  }

  const last = points[points.length - 1];
  return {
    scenarioId: scenario.id,
    points,
    milestones,
    warnings: [SIM_WARNING],
    summary: { totalCash: last.cumulativeCash, netCost: last.netEconomicCost },
  };
}

function shortHash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** A branch inherits parent events through its fork month and never touches the parent. */
export function fork(parent: Scenario, month: number, newEvents: LifeEvent[], name: string): Scenario {
  return {
    id: `s-${shortHash(`${parent.id}|${month}|${newEvents.map((e) => e.id).join(",")}`)}`,
    parentId: parent.id,
    forkMonth: month,
    name,
    events: [...parent.events.filter((e) => e.month <= month), ...newEvents],
    assumptions: { ...parent.assumptions },
  };
}

export function moveEvent(s: Scenario, eventId: string, newMonth: number): Scenario {
  return { ...s, events: s.events.map((e) => (e.id === eventId ? { ...e, month: newMonth } : e)) };
}

/** Default month: first relocation or family_change in the parent, else 12. */
export function makeReplaceScenario(parent: Scenario, replacement: VehicleConfig, month?: number): Scenario {
  const trigger = parent.events.find((e) => e.type === "relocation" || e.type === "family_change");
  const at = month ?? trigger?.month ?? 12;
  const event: LifeEvent = {
    id: `replace-${replacement.id}`,
    type: "vehicle_replacement",
    month: at,
    payload: { vehicleId: replacement.id },
    source: "user",
    assumptions: [],
    certainty: "clear",
    status: "confirmed",
  };
  return fork(parent, at, [event], `Replace with ${replacement.model}`);
}

// ---------------------------------------------------------------------------
// Dev 4 (Anirudh): assessSuitability, evaluate, findBreakEven, sensitivity, nextAction.
// Replaced at h11 (assessSuitability, evaluate), h14 (findBreakEven, sensitivity), h15 (nextAction).
// These never pick a winner. They return "inconclusive" and say why.
// ---------------------------------------------------------------------------

const MOCK_DECISION_NOTE = "MOCK: the decision engine has not landed, so nothing is recommended yet.";

export function assessSuitability(): SuitabilityResult {
  return NEEDS_VERIFICATION;
}

export function evaluate(a: { scenarios: Scenario[] }): DecisionEvaluation {
  return {
    scenarioIds: a.scenarios.map((s) => s.id),
    hardConstraints: [],
    preferredScenarioId: "inconclusive",
    rationale: [MOCK_DECISION_NOTE],
    sensitivity: [],
    nextAction: { label: "Keep exploring", detail: MOCK_DECISION_NOTE },
  };
}

const BREAK_EVEN_BOUNDS: Record<"annualMiles" | "fuelPricePerGal", [number, number]> = {
  annualMiles: [3000, 40000],
  fuelPricePerGal: [2, 8],
};

export function findBreakEven(a: { parameter: "annualMiles" | "fuelPricePerGal" }): BreakEvenResult {
  return {
    found: false,
    parameter: a.parameter,
    reason: "no_threshold_within_bounds",
    testedBounds: BREAK_EVEN_BOUNDS[a.parameter],
  };
}

export function sensitivity(): SensitivityResult {
  return { runs: [], heldCount: 0, totalCount: 0, heldScenarioId: "inconclusive" };
}

export function nextAction(): NextAction {
  return { label: "Keep exploring", detail: MOCK_DECISION_NOTE, factors: [] };
}
