import { beforeAll, describe, expect, it } from "vitest";
import type { LifeEvent, Scenario, SimContext, VehicleTwin } from "@/contracts";
import { mockSpecs, mockTwin } from "@/contracts/mocks";
import { vehicleFixtures } from "@/data/fixtures/vehicles";
import { simulate } from "./local";

let twin: VehicleTwin;
let ctx: SimContext;

beforeAll(async () => {
  const built = await mockTwin({ vehicle: vehicleFixtures[0] });
  if (!built.ok) throw new Error(built.error);
  twin = built.twin;
  ctx = {
    vehicles: { [twin.vehicle.id]: twin.vehicle },
    specs: { [twin.vehicle.id]: mockSpecs(twin.vehicle.id) },
  };
});

const event = (id: string, month: number, payload: LifeEvent["payload"], status: LifeEvent["status"] = "confirmed"): LifeEvent => ({
  id,
  type: "mileage_change",
  month,
  payload,
  source: "user",
  assumptions: [],
  certainty: "clear",
  status,
});

const scenario = (events: LifeEvent[]): Scenario => ({ id: "s", parentId: null, forkMonth: 0, name: "s", events, assumptions: {} });
const fuelAt = (events: LifeEvent[], month: number) => simulate(twin, scenario(events), ctx).points.find((p) => p.month === month)!.fuelSpend;

describe("the stand-in sim reacts to driving and fuel decisions", () => {
  it("driving more raises fuel spend from its month forward, and not before", () => {
    const more = [event("e1", 12, { annualMiles: 24000 })];
    expect(fuelAt(more, 11)).toBeCloseTo(fuelAt([], 11), 6);
    expect(fuelAt(more, 12)).toBeGreaterThan(fuelAt([], 12)); // month 12 is already on the new rate
    expect(fuelAt(more, 60)).toBeGreaterThan(fuelAt([], 60));
  });

  it("doubling the miles from month 12 doubles the fuel for months 12 to 60", () => {
    const perMonth = (fuelAt([], 60) - fuelAt([], 11)) / 49;
    const doubled = [event("e1", 12, { annualMiles: twin.driver.annualMiles * 2 })];
    expect(fuelAt(doubled, 60)).toBeCloseTo(fuelAt([], 11) + perMonth * 2 * 49, 4);
  });

  it("a higher fuel price raises fuel spend", () => {
    const pricier = [event("e1", 6, { fuelPricePerGal: twin.driver.fuelPricePerGal * 2 })];
    expect(fuelAt(pricier, 60)).toBeGreaterThan(fuelAt([], 60));
  });

  it("the later decision wins in the same variable", () => {
    const both = [event("a", 6, { annualMiles: 30000 }), event("b", 12, { annualMiles: twin.driver.annualMiles })];
    const first = fuelAt([event("a", 6, { annualMiles: 30000 })], 60);
    expect(fuelAt(both, 60)).toBeLessThan(first);
  });

  it("ignores proposals: only confirmed decisions change the path", () => {
    expect(fuelAt([event("e1", 12, { annualMiles: 40000 }, "proposed")], 60)).toBeCloseTo(fuelAt([], 60), 6);
  });

  it("ignores values it cannot use instead of inventing a number", () => {
    const junk = [event("e1", 12, { annualMiles: -5 }), event("e2", 12, { fuelPricePerGal: "lots" })];
    expect(fuelAt(junk, 60)).toBeCloseTo(fuelAt([], 60), 6);
  });

  it("still says it is a mock", () => {
    expect(simulate(twin, scenario([]), ctx).warnings[0]).toMatch(/^MOCK sim/);
  });
});
