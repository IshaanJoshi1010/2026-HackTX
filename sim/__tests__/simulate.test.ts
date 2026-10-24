import { describe, expect, it } from "vitest";
import { SimulationResultSchema } from "../../contracts/schemas";
import { HORIZON_MONTHS } from "../config";
import { applyEvents } from "../events";
import { loanPayment } from "../financing";
import { simulate, simulateDetailed } from "../simulate";
import { baseline, camry, camrySpec, ctx, deepFreeze, ev, paidOffTwin, twin, withEvents } from "./fixtures";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const firstMonthWith = (r: ReturnType<typeof simulate>, cost: number) => r.points.find(p => p.maintenanceSpend >= cost)?.month;

describe("simulate", () => {
  it("returns 60 schema-valid monthly points", () => {
    const r = simulate(twin, baseline, ctx);
    expect(r.points).toHaveLength(HORIZON_MONTHS);
    expect(r.points.map(p => p.month)).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
    expect(SimulationResultSchema.safeParse(r).success).toBe(true);
  });

  it("is deterministic and never mutates its inputs", () => {
    const frozen = deepFreeze(structuredClone({ twin, scenario: withEvents([ev("a", "mileage_change", 12, { annualMiles: 20000 })]), ctx }));
    const a = simulateDetailed(frozen.twin, frozen.scenario, frozen.ctx);
    const b = simulateDetailed(frozen.twin, frozen.scenario, frozen.ctx);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("matches the hand-calculated fuel example: $1,285.71 in year one", () => {
    const at28 = { ...ctx, specs: { [camry.id]: { ...camrySpec, mpgCombined: 28 } } };
    const r = simulate(twin, baseline, at28);
    expect(sum(r.points.slice(0, 12).map(p => p.fuelSpend)).toFixed(2)).toBe("1285.71");
  });

  it("raising annual miles 12,000 to 20,000 raises fuel and moves service earlier", () => {
    const low = simulate(twin, baseline, ctx);
    const high = simulate({ ...twin, driver: { ...twin.driver, annualMiles: 20000 } }, baseline, ctx);
    expect(high.summary.totalCash).toBeGreaterThan(low.summary.totalCash);
    expect(sum(high.points.map(p => p.fuelSpend))).toBeCloseTo(sum(low.points.map(p => p.fuelSpend)) * 20 / 12, 6);
    // 60k fluids service ($450): month 12 at 1,000 mi/mo, month 8 at 1,666.67 mi/mo
    expect(firstMonthWith(low, 450)).toBe(12);
    expect(firstMonthWith(high, 450)).toBe(8);
  });

  it("follows the accounting identity at every point", () => {
    const r = simulate(twin, baseline, ctx);
    const value0 = 28000 * 0.6; // age 4, odometer on the 12k/yr baseline
    for (const p of r.points) {
      expect(p.netEconomicCost).toBeCloseTo(p.cumulativeCash + (p.loanBalance - 15000) - (p.vehicleValue - value0), 6);
    }
  });

  it("amortizes an existing loan from its implied rate and pays it off on schedule", () => {
    const loanTwin = { ...twin, finance: { ...twin.finance, balance: 20000, monthlyPayment: loanPayment(20000, 0.06, 60), remainingTermMonths: 60 } };
    const d = simulateDetailed(loanTwin, baseline, ctx);
    expect(d.assumptions.find(a => a.key === "loanApr")).toMatchObject({ source: "estimated" });
    expect(d.assumptions.find(a => a.key === "loanApr")!.value as number).toBeCloseTo(0.06, 8);
    expect(d.result.points[0].loanBalance).toBeCloseTo(20000 - (386.66 - 100), 1);
    expect(d.result.points[59].loanBalance).toBe(0);
    // principal nets out: net cost = cash - principal repaid - value change
    const p = d.result.points[59];
    expect(p.netEconomicCost).toBeCloseTo(p.cumulativeCash - 20000 - (p.vehicleValue - 16800), 6);
  });

  it("the synthetic 36-month loan ends at month 36 with a milestone", () => {
    const r = simulate(twin, baseline, ctx);
    expect(r.points[34].loanBalance).toBeGreaterThan(0);
    expect(r.points[35].loanBalance).toBe(0);
    expect(r.milestones).toContain("Month 36: loan paid off");
  });

  it("a paid-off car has zero loan everywhere and cash is fuel + maintenance + insurance", () => {
    const r = simulate(paidOffTwin, baseline, ctx);
    for (const p of r.points) expect(p.loanBalance).toBe(0);
    const expected = sum(r.points.map(p => p.fuelSpend + p.maintenanceSpend)) + 130 * 60;
    expect(r.summary.totalCash).toBeCloseTo(expected, 6);
  });

  it("zero mileage: no fuel, no maintenance, odometer flat, value still ages", () => {
    const r = simulate({ ...paidOffTwin, driver: { ...paidOffTwin.driver, annualMiles: 0 } }, baseline, ctx);
    for (const p of r.points) {
      expect(p.fuelSpend).toBe(0);
      expect(p.maintenanceSpend).toBe(0);
      expect(p.mileage).toBe(48000);
    }
    expect(r.points[59].vehicleValue).toBeLessThan(r.points[0].vehicleValue);
    expect(r.summary.totalCash).toBe(130 * 60);
  });

  it("user-entered insurance replaces the illustrative default and is labeled user", () => {
    const d = simulateDetailed(paidOffTwin, withEvents([], { insurancePerMonth: 100 }), ctx);
    expect(d.assumptions.find(a => a.key === "insurancePerMonth")).toMatchObject({ value: 100, source: "user" });
  });

  it("a lease shows no owned value and stops payments at lease end", () => {
    const lease = { ...twin, driver: { ...twin.driver, financeType: "lease" as const },
      finance: { financeType: "lease" as const, balance: 0, monthlyPayment: 300, remainingTermMonths: 24, provenance: {} } };
    const r = simulate(lease, withEvents([], { insurancePerMonth: 0 }), { ...ctx, specs: {} });
    expect(r.points.every(p => p.vehicleValue === 0 && p.loanBalance === 0)).toBe(true);
    expect(r.summary.totalCash).toBeCloseTo(300 * 24 + sum(r.points.map(p => p.fuelSpend)), 6);
  });

  it("only confirmed events change the projection", () => {
    const base = simulate(twin, baseline, ctx);
    const proposed = simulate(twin, withEvents([ev("p", "mileage_change", 1, { annualMiles: 20000 }, "proposed"),
      ev("i", "fuel_price_change", 1, { fuelPricePerGal: 9 }, "invalid")]), ctx);
    expect(proposed.points).toEqual(base.points);
  });

  it("a mileage change applies from its event month forward", () => {
    const r = simulate(twin, withEvents([ev("m", "mileage_change", 12, { annualMiles: 24000 })]), ctx);
    expect(r.points[10].mileage - r.points[9].mileage).toBeCloseTo(1000);
    expect(r.points[11].mileage - r.points[10].mileage).toBeCloseTo(2000);
  });

  it("a commute change shifts annual miles by the round-trip delta from its month", () => {
    const commuter = { ...twin, driver: { ...twin.driver, commuteMilesOneWay: 10, commuteDaysPerWeek: 5 } };
    const { timeline } = applyEvents(commuter, withEvents([ev("c", "mileage_change", 6, { commuteMilesOneWay: 20 })]));
    expect(timeline[4].annualMiles).toBe(12000);
    expect(timeline[5].annualMiles).toBe(12000 + 10 * 2 * 5 * 50);
  });

  it("a fuel price change raises fuel spend from its month", () => {
    const r = simulate(twin, withEvents([ev("f", "fuel_price_change", 24, { fuelPricePerGal: 4 })]), ctx);
    expect(r.points[22].fuelSpend).toBeCloseTo(1000 / 32 * 3);
    expect(r.points[23].fuelSpend).toBeCloseTo(1000 / 32 * 4);
  });

  it("warns once when recurring cost exceeds a stated budget", () => {
    const r = simulate({ ...twin, driver: { ...twin.driver, monthlyBudget: 500 } }, baseline, ctx);
    expect(r.warnings.filter(w => w.includes("budget"))).toHaveLength(1);
  });

  it("labels every assumption it used", () => {
    const d = simulateDetailed(twin, baseline, ctx);
    const keys = d.assumptions.map(a => a.key);
    for (const k of ["mpg", "msrp", "depreciation", "maintenance", "insurancePerMonth", "startYear", "loanApr"]) expect(keys).toContain(k);
    expect(d.assumptions.find(a => a.key === "mpg")!.source).toBe("sourced");
    expect(d.assumptions.find(a => a.key === "insurancePerMonth")!.source).toBe("illustrative");
  });

  it("major service milestones carry their month and mileage", () => {
    expect(simulate(twin, baseline, ctx).milestones).toContain("Month 12: Fluids service at 60,000 mi ($450, illustrative)");
  });
});
