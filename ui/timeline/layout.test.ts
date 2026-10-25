import { describe, expect, it } from "vitest";
import type { LifeEvent, ProjectionPoint, Scenario, SimulationResult } from "@/contracts";
import { decisionsOf, pointAt, totalThrough } from "./layout";

const ev = (id: string, month: number, status: LifeEvent["status"] = "confirmed"): LifeEvent => ({
  id,
  type: "relocation",
  month,
  payload: {},
  source: "user",
  assumptions: [],
  certainty: "clear",
  status,
});

const sc = (id: string, events: LifeEvent[], parentId: string | null = null): Scenario => ({
  id,
  parentId,
  forkMonth: 0,
  name: id,
  events,
  assumptions: {},
});

describe("decisionsOf", () => {
  it("lists confirmed decisions in the order they happen", () => {
    const s = sc("s", [ev("late", 30), ev("early", 6), ev("mid", 12)]);
    expect(decisionsOf(s).map((e) => e.id)).toEqual(["early", "mid", "late"]);
  });

  it("keeps the written order for decisions in the same month", () => {
    expect(decisionsOf(sc("s", [ev("a", 12), ev("b", 12), ev("c", 12)])).map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("never includes a proposal or an invalid decision", () => {
    const s = sc("s", [ev("p", 3, "proposed"), ev("i", 4, "invalid"), ev("c", 5)]);
    expect(decisionsOf(s).map((e) => e.id)).toEqual(["c"]);
  });

  it("does not change the scenario", () => {
    const s = sc("s", [ev("b", 9), ev("a", 3)]);
    decisionsOf(s);
    expect(s.events.map((e) => e.id)).toEqual(["b", "a"]);
  });
});

describe("pointAt", () => {
  const point = (month: number): ProjectionPoint => ({
    month,
    vehicleId: "v",
    mileage: 0,
    fuelSpend: 0,
    maintenanceSpend: 0,
    vehicleValue: 0,
    loanBalance: 0,
    cumulativeCash: 0,
    netEconomicCost: month * 10,
    suitability: { passengerFit: "good", cargoFit: "good", tradeoffs: [], constraints: [], notes: [] },
  });
  const result = (months: number[]): SimulationResult => ({
    scenarioId: "s",
    points: months.map(point),
    milestones: [],
    warnings: [],
    summary: { totalCash: 0, netCost: 0 },
  });

  it("finds a point by month whether points start at 0 or at 1", () => {
    const from1 = result(Array.from({ length: 60 }, (_, i) => i + 1));
    expect(pointAt(from1, 1)?.month).toBe(1);
    expect(pointAt(from1, 60)?.netEconomicCost).toBe(600);
    expect(pointAt(from1, 0)).toBeUndefined();
    const from0 = result(Array.from({ length: 61 }, (_, i) => i));
    expect(pointAt(from0, 0)?.month).toBe(0);
    expect(pointAt(from0, 60)?.month).toBe(60);
    expect(pointAt(undefined, 5)).toBeUndefined();
  });
});

describe("totalThrough", () => {
  const withSpend = (): SimulationResult => ({
    scenarioId: "s",
    // 100 of fuel and 7 of upkeep in every month
    points: Array.from({ length: 60 }, (_, i) => ({
      month: i + 1,
      vehicleId: "v",
      mileage: 0,
      fuelSpend: 100,
      maintenanceSpend: 7,
      vehicleValue: 0,
      loanBalance: 0,
      cumulativeCash: 0,
      netEconomicCost: 0,
      suitability: { passengerFit: "good", cargoFit: "good", tradeoffs: [], constraints: [], notes: [] },
    })),
    milestones: [],
    warnings: [],
    summary: { totalCash: 0, netCost: 0 },
  });

  it("adds the months so far: the sim gives each month, not a running total", () => {
    expect(totalThrough(withSpend(), 1, "fuelSpend")).toBe(100);
    expect(totalThrough(withSpend(), 12, "fuelSpend")).toBe(1200);
    expect(totalThrough(withSpend(), 60, "maintenanceSpend")).toBe(420);
  });

  it("has nothing to add at month 0, with no result, or past nothing", () => {
    expect(totalThrough(withSpend(), 0, "fuelSpend")).toBeUndefined();
    expect(totalThrough(undefined, 12, "fuelSpend")).toBeUndefined();
  });

  it("does not change the result it reads", () => {
    const r = withSpend();
    const before = JSON.stringify(r);
    totalThrough(r, 30, "fuelSpend");
    expect(JSON.stringify(r)).toBe(before);
  });
});
