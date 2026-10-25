import { describe, expect, it } from "vitest";
import type { LifeEvent, Scenario } from "@/contracts";
import { carryOver } from "./carryOver";

const ev = (id: string, type: LifeEvent["type"], month: number, payload: LifeEvent["payload"]): LifeEvent => ({
  id, type, month, payload, source: "user", assumptions: [], certainty: "clear", status: "confirmed",
});
const scenario = (events: LifeEvent[]): Scenario => ({ id: "p", parentId: null, forkMonth: 0, name: "p", events, assumptions: {} });

const move = ev("move", "relocation", 12, { location: "Denver" });
const kid = ev("kid", "family_change", 32, { children: 2 });
const miles0 = ev("miles0", "mileage_change", 0, { annualMiles: 20000 });
const parent = scenario([move, kid, miles0]);

describe("carryOver", () => {
  it("keeps the parent's later events and leaves the earlier ones to fork", () => {
    const next = ev("n", "mileage_change", 6, { annualMiles: 15000 });
    const out = carryOver(parent, 6, [next]);
    expect(out.carried.map((e) => e.id)).toEqual(["move", "kid"]);
    expect(out.events.map((e) => e.id)).toEqual(["move", "kid", "n"]);
    expect(out.replaced).toEqual([]);
  });

  it("drops a later parent event that would undo a new one, and says so on the new event", () => {
    const next = ev("n", "relocation", 6, { location: "Seattle" });
    const out = carryOver(parent, 6, [next]);
    expect(out.carried.map((e) => e.id)).toEqual(["kid"]);
    expect(out.replaced.map((e) => e.id)).toEqual(["move"]);
    const note = out.events.find((e) => e.id === "n")!.assumptions;
    expect(note).toEqual(['Replaces "Move to Denver" at month 12 from the earlier future']);
  });

  it("keeps a later parent event when the new one comes after it (the new one wins by order)", () => {
    const next = ev("n", "relocation", 20, { location: "Seattle" });
    expect(carryOver(parent, 20, [next]).carried.map((e) => e.id)).toEqual(["kid"]);
    expect(carryOver(scenario([move]), 6, [ev("n", "relocation", 20, { location: "Seattle" })]).carried.map((e) => e.id)).toEqual(["move"]);
  });

  it("treats the old city key like location", () => {
    const old = ev("old", "relocation", 12, { city: "Denver" });
    const out = carryOver(scenario([old]), 6, [ev("n", "relocation", 6, { location: "Seattle" })]);
    expect(out.replaced.map((e) => e.id)).toEqual(["old"]);
  });

  it("lets delta events stack instead of replacing each other", () => {
    const first = ev("a", "family_change", 30, { childrenDelta: 1 });
    const second = ev("b", "family_change", 20, { childrenDelta: 1 });
    const out = carryOver(scenario([first]), 20, [second]);
    expect(out.carried.map((e) => e.id)).toEqual(["a"]);
    expect(out.replaced).toEqual([]);
  });

  it("does not let one kind of change replace another", () => {
    const next = ev("n", "fuel_price_change", 6, { fuelPricePerGal: 5 });
    expect(carryOver(parent, 6, [next]).replaced).toEqual([]);
  });

  it("replaces a planned car swap with a new one at or before it", () => {
    const swap = ev("swap", "vehicle_replacement", 24, { vehicleId: "rav4-2024-hybrid-xle", price: 38000 });
    const out = carryOver(scenario([swap]), 12, [ev("n", "vehicle_replacement", 12, { vehicleId: "rav4-2024-hybrid-xle", price: 36000 })]);
    expect(out.carried).toEqual([]);
    expect(out.replaced.map((e) => e.id)).toEqual(["swap"]);
  });

  it("ignores parent events that were never confirmed and does not change its inputs", () => {
    const proposed = { ...ev("p1", "mileage_change", 30, { annualMiles: 1 }), status: "proposed" as const };
    const before = structuredClone([parent, proposed]);
    const next = ev("n", "relocation", 6, { location: "Seattle" });
    const out = carryOver(scenario([move, proposed]), 6, [next]);
    expect(out.carried.map((e) => e.id)).toEqual([]);
    expect(next.assumptions).toEqual([]);
    expect([parent, proposed]).toEqual(before);
  });
});
