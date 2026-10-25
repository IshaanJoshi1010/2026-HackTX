import type { LifeEvent, MonthState, Scenario, VehicleTwin } from "../contracts";
import { HORIZON_MONTHS } from "./config";
import { commuteAnnualMiles } from "./mileage";

/**
 * Payload keys the sim understands, on any event type. Values are absolute unless named *Delta.
 *   annualMiles, commuteMilesOneWay, commuteDaysPerWeek, householdSize, children, carSeats,
 *   childrenDelta, fuelPricePerGal, monthlyBudget,
 *   (children and childrenDelta also move householdSize by the change, unless the event sets householdSize),
 *   cargoNeed ("low" | "medium" | "high"), location (recorded, never read: see noEffectNote),
 *   vehicleId, price, mileage (vehicle_replacement only: the car bought, its price and its odometer).
 * A commute change without annualMiles shifts annualMiles by the change in round-trip commute miles.
 * Unknown keys and wrongly typed values are ignored with a warning.
 */
export interface SimState extends MonthState {
  location: string; carSeats: number; commuteMilesOneWay?: number; commuteDaysPerWeek?: number;
  /** The latest replacement that set vehicleId; simulate reads it when the vehicle changes. */
  replacement?: { eventId: string; price?: number; mileage?: number };
}

const NUMERIC_KEYS = ["annualMiles", "commuteMilesOneWay", "commuteDaysPerWeek", "householdSize", "children",
  "carSeats", "fuelPricePerGal", "monthlyBudget"] as const;
type NumericKey = typeof NUMERIC_KEYS[number];
const STRING_KEYS = ["cargoNeed", "location", "vehicleId"] as const;
const PURCHASE_KEYS = ["price", "mileage"] as const;
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
    const known = [...NUMERIC_KEYS, ...STRING_KEYS, ...PURCHASE_KEYS, "childrenDelta"] as readonly string[];
    if (!known.includes(key)) warnings.push(`Event ${e.id}: ignored unknown payload key ${key}`);
    else if ((PURCHASE_KEYS as readonly string[]).includes(key) && e.type !== "vehicle_replacement") {
      warnings.push(`Event ${e.id}: ${key} only applies to vehicle_replacement; ignored`);
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
  // Children are household members: an absolute children change moves householdSize by the same amount
  // unless the event states householdSize. Car seats are never inferred.
  if (touched.includes("children") && !touched.includes("householdSize")) {
    next.householdSize = Math.max(1, prev.householdSize + next.children - prev.children);
    touched.push("householdSize");
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
  if (e.type === "vehicle_replacement") {
    if (!touched.includes("vehicleId")) warnings.push(`Event ${e.id}: vehicle_replacement has no vehicleId, so it has no effect`);
    else {
      const replacement: NonNullable<SimState["replacement"]> = { eventId: e.id };
      for (const key of PURCHASE_KEYS) {
        if (!(key in p)) continue;
        const v = p[key];
        if (typeof v !== "number" || !Number.isFinite(v) || v < 0) bad(key);
        else replacement[key] = v;
      }
      next.replacement = replacement;
    }
  } else if (touched.includes("vehicleId")) {
    warnings.push(`Event ${e.id}: vehicleId only changes through vehicle_replacement; ignored`);
    next.vehicleId = prev.vehicleId;
    touched.splice(touched.indexOf("vehicleId"), 1);
  }
  return { next, touched };
}

/**
 * Says so when a confirmed event moves nothing the simulation reads, instead of leaving the person to wonder why a
 * decision on the road changed no number. Notes read "Event <id>: <text>", like the other event warnings.
 *  - location is stored and handed to suitability, but nothing reads it (no cost of living, no insurance by city);
 *  - maintenance_decision has no handler;
 *  - a budget change only flags months that go over it and can rule a car out; it never changes a dollar;
 *  - an empty payload does nothing.
 */
function noEffectNote(e: LifeEvent, touched: string[]): string | null {
  if (e.type === "vehicle_replacement") return null; // has its own warnings (no vehicleId, car not in context)
  const modeled = touched.filter(k => k !== "location");
  if (modeled.length > 0) {
    return modeled.every(k => k === "monthlyBudget")
      ? "a budget change does not change cost. It only flags months that go over it and can rule a car out"
      : null;
  }
  const reason = Object.keys(e.payload).length === 0 ? "it has nothing in it"
    : e.type === "maintenance_decision" ? "maintenance decisions are not modeled"
    : touched.includes("location") ? "the new place is recorded, but the simulation does not use location"
    : "nothing in it is something the simulation reads";
  return `no modeled effect, ${reason}`;
}

/**
 * What-if overrides from scenario.assumptions, used by break-even and sensitivity:
 * annualMilesOverride / fuelPricePerGalOverride hold the value constant for every month (events cannot change it);
 * fuelPriceScale multiplies whatever fuel price applies that month.
 */
function withOverrides(s: SimState, a: Record<string, number>): SimState {
  const ok = (v: number | undefined): v is number => v !== undefined && Number.isFinite(v) && v >= 0;
  if (ok(a.annualMilesOverride)) s.annualMiles = a.annualMilesOverride;
  if (ok(a.fuelPricePerGalOverride)) s.fuelPricePerGal = a.fuelPricePerGalOverride;
  if (ok(a.fuelPriceScale)) s.fuelPricePerGal *= a.fuelPriceScale;
  return s;
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
        const note = noEffectNote(e, touched);
        if (note) warnings.push(`Event ${e.id}: ${note}`);
        for (const key of touched) {
          const earlier = setBy.get(key);
          if (earlier) warnings.push(`Month ${groupMonth}: ${key} set by both ${earlier} and ${e.id}; using ${e.id}`);
          setBy.set(key, e.id);
        }
        state = next;
      }
    }
    states.push(withOverrides({ ...state, month }, scenario.assumptions));
  }
  return { states, warnings };
}

export const toMonthState = (s: SimState): MonthState => {
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
