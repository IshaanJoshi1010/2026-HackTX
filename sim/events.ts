import type { LifeEvent, MonthState, Scenario, VehicleTwin } from "../contracts";
import { HORIZON_MONTHS } from "./config";
import { commuteAnnualMiles } from "./mileage";

/**
 * Payload keys the sim understands, on any event type. Values are absolute unless named *Delta.
 *   annualMiles, commuteMilesOneWay, commuteDaysPerWeek, householdSize, children, carSeats,
 *   childrenDelta (also moves householdSize unless the event sets it), fuelPricePerGal, monthlyBudget,
 *   cargoNeed ("low" | "medium" | "high"), location, vehicleId (vehicle_replacement).
 * A commute change without annualMiles shifts annualMiles by the change in round-trip commute miles.
 * Unknown keys and wrongly typed values are ignored with a warning.
 */
export interface SimState extends MonthState {
  location: string; carSeats: number; commuteMilesOneWay?: number; commuteDaysPerWeek?: number;
}

const NUMERIC_KEYS = ["annualMiles", "commuteMilesOneWay", "commuteDaysPerWeek", "householdSize", "children",
  "carSeats", "fuelPricePerGal", "monthlyBudget"] as const;
type NumericKey = typeof NUMERIC_KEYS[number];
const STRING_KEYS = ["cargoNeed", "location", "vehicleId"] as const;
const CARGO = ["low", "medium", "high"];

function initialState(twin: VehicleTwin): SimState {
  const d = twin.driver;
  const s: SimState = {
    month: 0, vehicleId: twin.vehicle.id, annualMiles: d.annualMiles, householdSize: d.householdSize,
    children: d.children, cargoNeed: d.cargoNeed, fuelPricePerGal: d.fuelPricePerGal,
    location: d.location, carSeats: d.carSeats,
  };
  if (d.monthlyBudget !== undefined) s.monthlyBudget = d.monthlyBudget;
  if (d.commuteMilesOneWay !== undefined) s.commuteMilesOneWay = d.commuteMilesOneWay;
  if (d.commuteDaysPerWeek !== undefined) s.commuteDaysPerWeek = d.commuteDaysPerWeek;
  return s;
}

/** Applies one event's payload. Returns the new state and the state variables it touched. */
function applyPayload(prev: SimState, e: LifeEvent, warnings: string[]): { next: SimState; touched: string[] } {
  const next: SimState = { ...prev };
  const touched: string[] = [];
  const p = e.payload;
  const bad = (key: string) => warnings.push(`Event ${e.id}: ignored invalid ${key} = ${JSON.stringify(p[key])}`);

  for (const key of Object.keys(p)) {
    if (!(NUMERIC_KEYS as readonly string[]).includes(key) && !(STRING_KEYS as readonly string[]).includes(key) && key !== "childrenDelta") {
      warnings.push(`Event ${e.id}: ignored unknown payload key ${key}`);
    }
  }
  for (const key of NUMERIC_KEYS) {
    if (!(key in p)) continue;
    const v = p[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || (key === "householdSize" && v < 1)) { bad(key); continue; }
    (next as Record<NumericKey, number | undefined>)[key] = v;
    touched.push(key);
  }
  for (const key of STRING_KEYS) {
    if (!(key in p)) continue;
    const v = p[key];
    if (typeof v !== "string" || v.length === 0 || (key === "cargoNeed" && !CARGO.includes(v))) { bad(key); continue; }
    if (key === "cargoNeed") next.cargoNeed = v as SimState["cargoNeed"];
    else next[key] = v;
    touched.push(key);
  }
  if ("childrenDelta" in p) {
    const d = p.childrenDelta;
    if (typeof d !== "number" || !Number.isInteger(d)) bad("childrenDelta");
    else {
      next.children = Math.max(0, next.children + d);
      touched.push("children");
      if (!touched.includes("householdSize")) { next.householdSize = Math.max(1, next.householdSize + d); touched.push("householdSize"); }
    }
  }
  const commuteChanged = touched.includes("commuteMilesOneWay") || touched.includes("commuteDaysPerWeek");
  if (commuteChanged && !touched.includes("annualMiles")) {
    if (prev.commuteMilesOneWay === undefined || prev.commuteDaysPerWeek === undefined) {
      warnings.push(`Event ${e.id}: no prior commute on record, so the full new commute was added to annual miles`);
    }
    const delta = commuteAnnualMiles(next.commuteMilesOneWay, next.commuteDaysPerWeek)
      - commuteAnnualMiles(prev.commuteMilesOneWay, prev.commuteDaysPerWeek);
    next.annualMiles = Math.max(0, prev.annualMiles + delta);
    touched.push("annualMiles");
  }
  if (e.type === "vehicle_replacement" && !touched.includes("vehicleId")) {
    warnings.push(`Event ${e.id}: vehicle_replacement has no vehicleId, so it has no effect`);
  }
  return { next, touched };
}

/**
 * Month-by-month state for months 1..HORIZON_MONTHS. Only confirmed events apply, sorted by month
 * (stable inside a month), each from its month forward. Same variable, same month: later in the list wins.
 */
export function resolveStates(twin: VehicleTwin, scenario: Scenario): { states: SimState[]; warnings: string[] } {
  const warnings: string[] = [];
  const events = scenario.events
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.status === "confirmed")
    .sort((a, b) => a.e.month - b.e.month || a.i - b.i)
    .map(({ e }) => e);
  for (const e of events) if (e.month > HORIZON_MONTHS) warnings.push(`Event ${e.id}: month ${e.month} is past the ${HORIZON_MONTHS}-month horizon`);

  let state = initialState(twin);
  let cursor = 0;
  const states: SimState[] = [];
  for (let month = 1; month <= HORIZON_MONTHS; month++) {
    while (cursor < events.length && events[cursor].month <= month) {
      const groupMonth = events[cursor].month;
      const setBy = new Map<string, string>();
      while (cursor < events.length && events[cursor].month === groupMonth) {
        const e = events[cursor++];
        const { next, touched } = applyPayload(state, e, warnings);
        for (const key of touched) {
          const earlier = setBy.get(key);
          if (earlier) warnings.push(`Month ${groupMonth}: ${key} set by both ${earlier} and ${e.id}; using ${e.id}`);
          setBy.set(key, e.id);
        }
        state = next;
      }
    }
    states.push({ ...state, month });
  }
  return { states, warnings };
}

const toMonthState = (s: SimState): MonthState => {
  const m: MonthState = {
    month: s.month, vehicleId: s.vehicleId, annualMiles: s.annualMiles, householdSize: s.householdSize,
    children: s.children, cargoNeed: s.cargoNeed, fuelPricePerGal: s.fuelPricePerGal,
  };
  if (s.monthlyBudget !== undefined) m.monthlyBudget = s.monthlyBudget;
  return m;
};

export function applyEvents(twin: VehicleTwin, scenario: Scenario): { timeline: MonthState[]; warnings: string[] } {
  const { states, warnings } = resolveStates(twin, scenario);
  return { timeline: states.map(toMonthState), warnings };
}
