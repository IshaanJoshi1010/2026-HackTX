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
