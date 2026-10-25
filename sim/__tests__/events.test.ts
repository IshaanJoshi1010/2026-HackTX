import { describe, expect, it } from "vitest";
import { MonthStateSchema } from "../../contracts/schemas";
import { applyEvents } from "../events";
import { ev, twin, withEvents } from "./fixtures";

describe("applyEvents", () => {
  it("returns 60 schema-valid month states starting from the twin", () => {
    const { timeline, warnings } = applyEvents(twin, withEvents([]));
    expect(timeline).toHaveLength(60);
    expect(warnings).toEqual([]);
    for (const s of timeline) expect(MonthStateSchema.safeParse(s).success).toBe(true);
    expect(timeline[0]).toMatchObject({ month: 1, vehicleId: "camry-2022-se", annualMiles: 12000, householdSize: 2 });
  });

  it("applies events at months 12, 36, 48 in order regardless of list order", () => {
    const { timeline } = applyEvents(twin, withEvents([
      ev("c", "mileage_change", 48, { annualMiles: 8000 }),
      ev("a", "relocation", 12, { location: "Denver, CO", annualMiles: 20000 }),
      ev("b", "family_change", 36, { childrenDelta: 1 }),
    ]));
    expect(timeline[10]).toMatchObject({ annualMiles: 12000, children: 0, householdSize: 2 });
    expect(timeline[11]).toMatchObject({ annualMiles: 20000, children: 0 });
    expect(timeline[35]).toMatchObject({ annualMiles: 20000, children: 1, householdSize: 3 });
    expect(timeline[47]).toMatchObject({ annualMiles: 8000, children: 1, householdSize: 3 });
  });

  it("same variable in the same month: later in the list wins, with a warning", () => {
    const { timeline, warnings } = applyEvents(twin, withEvents([
      ev("x", "mileage_change", 6, { annualMiles: 15000 }),
      ev("y", "mileage_change", 6, { annualMiles: 18000 }),
    ]));
    expect(timeline[5].annualMiles).toBe(18000);
    expect(warnings).toContain("Month 6: annualMiles set by both x and y; using y");
  });

  it("ignores proposed and invalid events", () => {
    const { timeline } = applyEvents(twin, withEvents([
      ev("p", "mileage_change", 1, { annualMiles: 20000 }, "proposed"),
      ev("i", "family_change", 1, { children: 3 }, "invalid"),
    ]));
    expect(timeline.every(s => s.annualMiles === 12000 && s.children === 0)).toBe(true);
  });

  it("warns on unknown keys and bad values instead of guessing", () => {
    const { timeline, warnings } = applyEvents(twin, withEvents([
      ev("u", "cargo_change", 3, { cargoNeed: "huge", vibe: "big" }),
      ev("n", "mileage_change", 3, { annualMiles: "lots" }),
    ]));
    expect(timeline[2].cargoNeed).toBe("low");
    expect(timeline[2].annualMiles).toBe(12000);
    expect(warnings).toEqual(expect.arrayContaining([
      "Event u: ignored unknown payload key vibe",
      'Event u: ignored invalid cargoNeed = "huge"',
      'Event n: ignored invalid annualMiles = "lots"',
    ]));
  });

  it("an absolute children change moves household size too, unless the event states it", () => {
    // Shape Dev 3's extraction produces for "expecting my second child in 2029".
    const { timeline } = applyEvents(twin, withEvents([ev("kid", "family_change", 32, { children: 2 })]));
    expect(timeline[30]).toMatchObject({ children: 0, householdSize: 2 });
    expect(timeline[31]).toMatchObject({ children: 2, householdSize: 4 });
    const stated = applyEvents(twin, withEvents([ev("kid", "family_change", 1, { children: 2, householdSize: 3 })]));
    expect(stated.timeline[0]).toMatchObject({ children: 2, householdSize: 3 });
    const fewer = applyEvents({ ...twin, driver: { ...twin.driver, householdSize: 4, children: 2 } }, withEvents([ev("k", "family_change", 1, { children: 1 })]));
    expect(fewer.timeline[0]).toMatchObject({ children: 1, householdSize: 3 });
  });

  it("does not invent car seats when a child is added", () => {
    const { timeline } = applyEvents(twin, withEvents([ev("b", "family_change", 1, { childrenDelta: 1 })]));
    expect(timeline[0]).toMatchObject({ children: 1, householdSize: 3 });
  });

  it("records vehicle replacement in the timeline", () => {
    const { timeline } = applyEvents(twin, withEvents([ev("r", "vehicle_replacement", 12, { vehicleId: "rav4-2024-hybrid-xle" })]));
    expect(timeline[10].vehicleId).toBe("camry-2022-se");
    expect(timeline[11].vehicleId).toBe("rav4-2024-hybrid-xle");
  });
});

describe("events that change no number say so", () => {
  const notes = (events: ReturnType<typeof ev>[]) => applyEvents(twin, withEvents(events)).warnings.filter(w => w.includes("no modeled effect") || w.includes("does not change cost"));

  it("a move that only names a place has no modeled effect", () => {
    expect(notes([ev("move", "relocation", 12, { location: "Denver" })])).toEqual([
      "Event move: no modeled effect, the new place is recorded, but the simulation does not use location",
    ]);
  });

  it("a move with driving or fuel changes in it is not flagged", () => {
    expect(notes([ev("move", "relocation", 12, { location: "Denver", annualMiles: 20000 })])).toEqual([]);
    expect(notes([ev("gas", "relocation", 12, { location: "Denver", fuelPricePerGal: 4.2 })])).toEqual([]);
  });

  it("maintenance decisions have no handler", () => {
    expect(notes([ev("m", "maintenance_decision", 6, {})])).toEqual(["Event m: no modeled effect, it has nothing in it"]);
    expect(notes([ev("m", "maintenance_decision", 6, { skip: "brakes" })])).toEqual(["Event m: no modeled effect, maintenance decisions are not modeled"]);
  });

  it("an empty payload or only unknown keys reports nothing happened", () => {
    expect(notes([ev("e", "mileage_change", 6, {})])).toEqual(["Event e: no modeled effect, it has nothing in it"]);
    expect(notes([ev("u", "mileage_change", 6, { color: "red" })])).toEqual(["Event u: no modeled effect, nothing in it is something the simulation reads"]);
  });

  it("a budget change says it never changes a dollar", () => {
    expect(notes([ev("b", "budget_change", 3, { monthlyBudget: 900 })])).toEqual([
      "Event b: a budget change does not change cost. It only flags months that go over it and can rule a car out",
    ]);
    expect(notes([ev("b", "budget_change", 3, { monthlyBudget: 900, annualMiles: 9000 })])).toEqual([]);
  });

  it("says nothing about events that do change numbers, or a replacement", () => {
    expect(notes([ev("a", "mileage_change", 6, { annualMiles: 20000 }), ev("k", "family_change", 30, { childrenDelta: 1 }),
      ev("r", "vehicle_replacement", 12, { vehicleId: "rav4-2024-hybrid-xle" })])).toEqual([]);
  });

  it("says it once per event, not once per month, and skips events that are not confirmed", () => {
    const proposed = { ...ev("p", "relocation", 4, { location: "Reno" }), status: "proposed" as const };
    expect(notes([ev("move", "relocation", 1, { location: "Denver" }), proposed])).toHaveLength(1);
  });

  it("reaches simulate's warnings, where the Details page reads them", async () => {
    const { simulate } = await import("../simulate");
    const { ctx } = await import("./fixtures");
    const r = simulate(twin, withEvents([ev("move", "relocation", 12, { location: "Denver" })]), ctx);
    expect(r.warnings).toContain("Event move: no modeled effect, the new place is recorded, but the simulation does not use location");
  });
});
