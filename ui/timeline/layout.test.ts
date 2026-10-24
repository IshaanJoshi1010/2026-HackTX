import { describe, expect, it } from "vitest";
import type { LifeEvent, ProjectionPoint, Scenario, SimulationResult } from "@/contracts";
import {
  YEAR_TICKS,
  buildLanes,
  fanOffsets,
  laneEvents,
  lanePath,
  milestonesOf,
  monthToPct,
  pointAt,
  usdCompact,
  xToMonth,
  yearLabel,
} from "./layout";

const sc = (id: string, parentId: string | null, forkMonth: number, events: LifeEvent[] = []): Scenario => ({
  id,
  parentId,
  forkMonth,
  name: id.toUpperCase(),
  events,
  assumptions: {},
});

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

const base = sc("base", null, 0);
const denver = sc("denver", "base", 12, [ev("move", 12)]);
const rav4 = sc("rav4", "denver", 12, [ev("move", 12), ev("swap", 12)]);
const all = [base, denver, rav4];

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

describe("buildLanes", () => {
  it("makes one lane per scenario, with parents first and fork months kept", () => {
    const lanes = buildLanes(all, "denver", true);
    expect(lanes.map((l) => [l.id, l.row, l.parentRow, l.startMonth, l.active])).toEqual([
      ["base", 0, null, 0, false],
      ["denver", 1, 0, 12, true],
      ["rav4", 2, 1, 12, false],
    ]);
  });

  it("every lane is a real scenario", () => {
    const ids = new Set(all.map((s) => s.id));
    expect(buildLanes(all, "base", true).every((l) => ids.has(l.id))).toBe(true);
  });

  it("focus mode shows only the active scenario as a full line", () => {
    const lanes = buildLanes(all, "rav4", false);
    expect(lanes).toHaveLength(1);
    expect(lanes[0]).toMatchObject({ id: "rav4", row: 0, parentRow: null, startMonth: 0, active: true });
  });

  it("falls back to the first scenario when the active id is unknown", () => {
    expect(buildLanes(all, "ghost", false)[0].id).toBe("base");
  });

  it("treats an unknown parent as no parent instead of crashing", () => {
    const orphan = sc("orphan", "missing", 20);
    expect(buildLanes([base, orphan], "orphan", true)[1]).toMatchObject({ parentRow: null, startMonth: 0 });
  });

  it("handles no scenarios", () => {
    expect(buildLanes([], "base", true)).toEqual([]);
    expect(buildLanes([], "base", false)).toEqual([]);
  });

  it("keeps four or more branches on separate rows", () => {
    const many = [base, sc("a", "base", 6), sc("b", "base", 12), sc("c", "a", 18), sc("d", "b", 24)];
    const rows = buildLanes(many, "d", true).map((l) => l.row);
    expect(new Set(rows).size).toBe(5);
  });
});

describe("laneEvents", () => {
  it("shows an event once: on the lane where it was added, not on its children", () => {
    expect(laneEvents(base, undefined)).toEqual([]);
    expect(laneEvents(denver, base).map((e) => e.id)).toEqual(["move"]);
    expect(laneEvents(rav4, denver).map((e) => e.id)).toEqual(["swap"]);
  });

  it("never shows a proposal or an invalid event", () => {
    const s = sc("s", "base", 3, [ev("p", 3, "proposed"), ev("i", 4, "invalid"), ev("c", 5)]);
    expect(laneEvents(s, base).map((e) => e.id)).toEqual(["c"]);
  });

  it("with no parent drawn, shows the whole history", () => {
    expect(laneEvents(rav4, undefined).map((e) => e.id)).toEqual(["move", "swap"]);
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

describe("lanePath", () => {
  it("is a straight line for a lane with no parent", () => {
    const [lane] = buildLanes([base], "base", true);
    expect(lanePath(lane, 600)).toBe("M 0 22 L 600 22");
  });

  it("branches off the parent line at the fork month, then runs to month 60", () => {
    const lanes = buildLanes(all, "denver", true);
    const d = lanePath(lanes[1], 600); // fork at month 12 = x 120, parent row 0 (y 22), own row 1 (y 66)
    expect(d.startsWith("M 120 22 C")).toBe(true);
    expect(d.endsWith("L 600 66")).toBe(true);
  });

  it("never runs past month 60 when forked late", () => {
    const late = sc("late", "base", 60);
    const lane = buildLanes([base, late], "late", true)[1];
    const d = lanePath(lane, 600);
    expect(d).toMatch(/^M 600 22 C/);
    expect(d.endsWith("L 600 66")).toBe(true);
  });
});

describe("usdCompact", () => {
  it.each([
    [0, "$0"],
    [840, "$840"],
    [1250, "$1.3k"],
    [13315, "$13k"],
    [250000, "$250k"],
    [1_400_000, "$1.4M"],
    [-2500, "-$2.5k"],
  ])("%d -> %s", (n, text) => {
    expect(usdCompact(n)).toBe(text);
  });
});

describe("fanOffsets", () => {
  it("leaves a lone event where it is", () => {
    expect(fanOffsets([{ id: "a", month: 12 }]).get("a")).toBe(0);
  });

  it("spreads events in the same month side by side, centered on the month", () => {
    const offs = fanOffsets([{ id: "a", month: 12 }, { id: "b", month: 12 }]);
    expect(offs.get("a")).toBe(-13);
    expect(offs.get("b")).toBe(13);
    const three = fanOffsets([{ id: "a", month: 5 }, { id: "b", month: 5 }, { id: "c", month: 5 }]);
    expect([three.get("a"), three.get("b"), three.get("c")]).toEqual([-26, 0, 26]);
  });

  it("does not spread events in different months", () => {
    const offs = fanOffsets([{ id: "a", month: 12 }, { id: "b", month: 13 }, { id: "c", month: 12 }]);
    expect(offs.get("b")).toBe(0);
    expect(offs.get("a")).toBe(-13);
    expect(offs.get("c")).toBe(13);
  });

  it("handles no events", () => {
    expect(fanOffsets([]).size).toBe(0);
  });
});
