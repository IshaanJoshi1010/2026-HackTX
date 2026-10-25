import { describe, expect, it } from "vitest";
import { ScenarioSchema } from "../../contracts/schemas";
import { affectedFromMonth, canEditEvent, deleteEvent, editEvent, fork, InheritedEventError, moveEvent } from "../branch";
import { makeReplaceScenario } from "../makeReplace";
import { simulate } from "../simulate";
import { baseline, ctx, deepFreeze, ev, rav4, twin, withEvents } from "./fixtures";

const denverEvents = [
  ev("move", "relocation", 12, { location: "Denver, CO", annualMiles: 20000 }),
  ev("baby", "family_change", 30, { childrenDelta: 1 }),
];
const json = (x: unknown) => JSON.stringify(x);

describe("fork", () => {
  it("inherits events before the fork, drops the parent's future, and adds new events", () => {
    const parent = withEvents([ev("early", "fuel_price_change", 6, { fuelPricePerGal: 3.5 }), ev("late", "mileage_change", 40, { annualMiles: 9000 })]);
    const child = fork(parent, 12, denverEvents, "Denver move");
    expect(child).toMatchObject({ id: "s/12-denver-move", parentId: "s", forkMonth: 12, name: "Denver move" });
    expect(child.events.map(e => e.id)).toEqual(["early", "move", "baby"]);
    expect(ScenarioSchema.safeParse(child).success).toBe(true);
  });

  it("moves new events dated before the fork to the fork month, and says so", () => {
    const child = fork(baseline, 12, [ev("x", "mileage_change", 3, { annualMiles: 15000 })], "x");
    expect(child.events[0].month).toBe(12);
    expect(child.events[0].assumptions).toContain("Moved from month 3 to the fork month 12");
  });

  it("forking twice leaves the parent and the sibling deeply equal to before", () => {
    const parent = deepFreeze(withEvents([ev("early", "fuel_price_change", 6, { fuelPricePerGal: 3.5 })]));
    const parentBefore = structuredClone(parent);
    const a = fork(parent, 12, denverEvents, "A");
    const aBefore = structuredClone(a);
    const b = fork(parent, 24, [ev("c", "cargo_change", 24, { cargoNeed: "high" })], "B");
    b.events[0].payload.fuelPricePerGal = 99; // mutating a child must not leak anywhere
    expect(parent).toEqual(parentBefore);
    expect(a).toEqual(aBefore);
  });

  it("a branch's points before its fork month are identical to its parent's", () => {
    const parent = withEvents([ev("early", "fuel_price_change", 6, { fuelPricePerGal: 3.5 })]);
    const child = fork(parent, 12, denverEvents, "Denver");
    const p = simulate(twin, parent, ctx), c = simulate(twin, child, ctx);
    expect(json(c.points.slice(0, 11))).toBe(json(p.points.slice(0, 11)));
    expect(c.points[11].fuelSpend).toBeGreaterThan(p.points[11].fuelSpend);
  });

  it("supports four or more simultaneous branches", () => {
    const parent = deepFreeze(withEvents([]));
    const branches = [6, 12, 24, 36, 48].map(m => fork(parent, m, [ev(`m${m}`, "mileage_change", m, { annualMiles: 20000 })], `at ${m}`));
    const results = branches.map(b => simulate(twin, b, ctx));
    expect(new Set(branches.map(b => b.id)).size).toBe(5);
    const fuel = results.map(r => r.summary.totalCash);
    for (let i = 1; i < fuel.length; i++) expect(fuel[i]).toBeLessThan(fuel[i - 1]); // later switch, less fuel
  });
});

describe("moveEvent, editEvent, deleteEvent", () => {
  const s = withEvents([ev("a", "mileage_change", 12, { annualMiles: 20000 }), ev("b", "fuel_price_change", 36, { fuelPricePerGal: 4 })]);

  it("moving an event leaves earlier points byte-identical", () => {
    const moved = moveEvent(s, "b", 48);
    const before = simulate(twin, s, ctx), after = simulate(twin, moved, ctx);
    expect(affectedFromMonth(s, moved)).toBe(36);
    expect(json(after.points.slice(0, 35))).toBe(json(before.points.slice(0, 35)));
    expect(json(after.points[35])).not.toBe(json(before.points[35]));
    expect(s.events[1].month).toBe(36); // original untouched
  });

  it("editing and deleting return new scenarios and only touch later months", () => {
    const edited = editEvent(s, "a", { payload: { annualMiles: 15000 }, id: "hijack" });
    expect(edited.events[0]).toMatchObject({ id: "a", payload: { annualMiles: 15000 } });
    const deleted = deleteEvent(s, "b");
    expect(deleted.events.map(e => e.id)).toEqual(["a"]);
    expect(affectedFromMonth(s, deleted)).toBe(36);
    expect(json(simulate(twin, deleted, ctx).points.slice(0, 35))).toBe(json(simulate(twin, s, ctx).points.slice(0, 35)));
    expect(s.events).toHaveLength(2);
  });

  it("an edited payload merges into the old one instead of replacing it", () => {
    const replace = makeReplaceScenario(baseline, rav4);
    const swap = replace.events.find(e => e.type === "vehicle_replacement")!;
    const edited = editEvent(replace, swap.id, { payload: { price: 30000 } });
    const after = edited.events.find(e => e.id === swap.id)!;
    expect(after.payload).toEqual({ ...swap.payload, price: 30000 }); // vehicleId survives
    expect(after.payload.vehicleId).toBe(rav4.id);
    expect(simulate(twin, edited, ctx).points.at(-1)!.vehicleId).toBe(rav4.id); // still a replace, not a copy of keep
    expect(replace.events.find(e => e.id === swap.id)!.payload).toEqual(swap.payload); // original untouched
  });

  it("unknown ids return an unchanged copy", () => {
    const same = moveEvent(s, "nope", 5);
    expect(same).toEqual(s);
    expect(same).not.toBe(s);
    expect(affectedFromMonth(s, same)).toBeNull();
  });

  it("a branch cannot rewrite inherited history", () => {
    const child = fork(withEvents([ev("early", "fuel_price_change", 6, { fuelPricePerGal: 3.5 })]), 12, denverEvents, "Denver");
    expect(canEditEvent(child, "early")).toBe(false);
    expect(canEditEvent(child, "move")).toBe(true);
    expect(() => moveEvent(child, "early", 20)).toThrow(InheritedEventError);
    expect(() => deleteEvent(child, "early")).toThrow(InheritedEventError);
    expect(moveEvent(child, "baby", 2).events.find(e => e.id === "baby")!.month).toBe(12); // clamped to the fork
  });
});

describe("makeReplaceScenario", () => {
  it("defaults to the first relocation or family change month", () => {
    const parent = deepFreeze(withEvents([ev("baby", "family_change", 30, { childrenDelta: 1 }), ev("move", "relocation", 12, { location: "Denver, CO" })]));
    const before = structuredClone(parent);
    const r = makeReplaceScenario(parent, rav4);
    expect(r).toMatchObject({ parentId: "s", forkMonth: 12, name: "Replace with RAV4" });
    const evt = r.events.find(e => e.type === "vehicle_replacement")!;
    expect(evt).toMatchObject({ month: 12, status: "confirmed", source: "fixture", payload: { vehicleId: rav4.id } });
    expect(r.events).toHaveLength(3);
    expect(parent).toEqual(before);
    expect(ScenarioSchema.safeParse(r).success).toBe(true);
  });

  it("falls back to month 12, ignores unconfirmed triggers, and honors an explicit month", () => {
    expect(makeReplaceScenario(baseline, rav4).forkMonth).toBe(12);
    expect(makeReplaceScenario(withEvents([ev("m", "relocation", 6, {}, "proposed")]), rav4).forkMonth).toBe(12);
    expect(makeReplaceScenario(baseline, rav4, 24).forkMonth).toBe(24);
  });

  it("demo flow: keep vs replace after the Denver move, over the same horizon", () => {
    const denver = fork(baseline, 12, denverEvents, "Denver move");
    const replace = makeReplaceScenario(denver, rav4);
    const k = simulate(twin, denver, ctx), r = simulate(twin, replace, ctx);
    expect(k.points).toHaveLength(60);
    expect(r.points).toHaveLength(60);
    expect(json(r.points.slice(0, 11))).toBe(json(k.points.slice(0, 11)));
    expect(r.points[11].vehicleId).toBe(rav4.id);
    expect(r.points[59].fuelSpend).toBeLessThan(k.points[59].fuelSpend);
    expect(r.summary.totalCash).not.toBe(k.summary.totalCash);
  });
});
