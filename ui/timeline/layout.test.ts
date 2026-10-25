import { describe, expect, it } from "vitest";
import type { LifeEvent, ProjectionPoint, Scenario, SimulationResult } from "@/contracts";
import { YEAR_TICKS, decisionsOf, fanOffsets, inheritedIds, milestonesOf, monthToPct, pointAt, totalThrough, xToMonth, yearLabel } from "./layout";

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

describe("axis math", () => {
  it("maps months to percentages and back", () => {
    expect(monthToPct(0)).toBe(0);
    expect(monthToPct(30)).toBe(50);
    expect(monthToPct(60)).toBe(100);
    expect(monthToPct(99)).toBe(100);
    expect(xToMonth(150, { left: 100, width: 600 })).toBe(5);
    expect(xToMonth(100, { left: 100, width: 600 })).toBe(0);
    expect(xToMonth(700, { left: 100, width: 600 })).toBe(60);
    expect(xToMonth(5000, { left: 100, width: 600 })).toBe(60);
    expect(xToMonth(-50, { left: 100, width: 600 })).toBe(0);
  });

  it("does not divide by a zero-width axis", () => {
    expect(xToMonth(10, { left: 0, width: 0 })).toBe(0);
  });

  it("labels year ticks", () => {
    expect([...YEAR_TICKS].map(yearLabel)).toEqual(["Now", "1 yr", "2 yr", "3 yr", "4 yr", "5 yr"]);
  });
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

describe("inheritedIds", () => {
  it("is the parent's decisions, and empty with no parent", () => {
    expect([...inheritedIds(sc("p", [ev("x", 1), ev("y", 2)]))]).toEqual(["x", "y"]);
    expect(inheritedIds(undefined).size).toBe(0);
  });
});

describe("milestonesOf and pointAt", () => {
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
  const result = (months: number[], milestones: string[] = []): SimulationResult => ({
    scenarioId: "s",
    points: months.map(point),
    milestones,
    warnings: [],
    summary: { totalCash: 0, netCost: 0 },
  });

  it("parses month milestones and skips the rest", () => {
    const r = result([1], ["Month 36: loan paid off", "Month 12: replace with RAV4", "Not a month line", "Month 99: out of range"]);
    expect(milestonesOf(r)).toEqual([
      { month: 36, text: "loan paid off" },
      { month: 12, text: "replace with RAV4" },
    ]);
    expect(milestonesOf(undefined)).toEqual([]);
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

describe("fanOffsets", () => {
  it("leaves a lone decision where it is", () => {
    expect(fanOffsets([{ id: "a", month: 12 }]).get("a")).toBe(0);
  });

  it("spreads decisions in the same month side by side, centered on the month", () => {
    const two = fanOffsets([{ id: "a", month: 12 }, { id: "b", month: 12 }]);
    expect([two.get("a"), two.get("b")]).toEqual([-20, 20]);
    const three = fanOffsets([{ id: "a", month: 5 }, { id: "b", month: 5 }, { id: "c", month: 5 }]);
    expect([three.get("a"), three.get("b"), three.get("c")]).toEqual([-40, 0, 40]);
  });

  it("does not spread decisions in different months", () => {
    const offs = fanOffsets([{ id: "a", month: 12 }, { id: "b", month: 13 }, { id: "c", month: 12 }]);
    expect(offs.get("b")).toBe(0);
    expect(offs.get("a")).toBe(-20);
    expect(offs.get("c")).toBe(20);
  });

  it("handles no decisions", () => {
    expect(fanOffsets([]).size).toBe(0);
  });
});
