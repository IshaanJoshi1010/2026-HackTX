import { describe, expect, it } from "vitest";
import type { LifeEvent, ProjectionPoint, Scenario, SimulationResult, SuitabilityResult } from "@/contracts";
import { decisionEffects, fitNote } from "./effects";

const fit = (passengerFit: SuitabilityResult["passengerFit"], cargoFit: SuitabilityResult["cargoFit"] = "good"): SuitabilityResult => ({
  passengerFit,
  cargoFit,
  tradeoffs: [],
  constraints: [],
  notes: [],
});

const ev = (id: string, month: number, payload: LifeEvent["payload"], status: LifeEvent["status"] = "confirmed"): LifeEvent => ({
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

/**
 * A stand-in simulation: each confirmed decision adds `cost` dollars a month from its
 * month on, and a decision marked `tight` makes passenger fit tight.
 */
function fakeSimulate(s: Scenario): SimulationResult {
  const points: ProjectionPoint[] = Array.from({ length: 60 }, (_, i) => {
    const month = i + 1;
    let net = month * 100;
    let tight = false;
    for (const e of s.events) {
      if (e.status !== "confirmed" || e.month > month) continue;
      net += Number(e.payload.cost ?? 0) * (month - e.month + 1);
      if (e.payload.tight) tight = true;
    }
    return {
      month,
      vehicleId: "v",
      mileage: 0,
      fuelSpend: 0,
      maintenanceSpend: 0,
      vehicleValue: 0,
      loanBalance: 0,
      cumulativeCash: 0,
      netEconomicCost: net,
      suitability: fit(tight ? "tight" : "good"),
    };
  });
  return { scenarioId: s.id, points, milestones: [], warnings: [], summary: { totalCash: 0, netCost: 0 } };
}

const run = (events: LifeEvent[], month = 60) => {
  const s = scenario(events);
  return decisionEffects({ scenario: s, result: fakeSimulate(s), month, simulate: fakeSimulate });
};

describe("decisionEffects", () => {
  it("each decision's effect is what the future costs with it minus without it", () => {
    const out = run([ev("a", 12, { cost: 10 }), ev("b", 24, { cost: -5 })]);
    expect(out.map((e) => e.event.id)).toEqual(["a", "b"]);
    expect(out[0].costDelta).toBe(10 * 49); // months 12 to 60
    expect(out[1].costDelta).toBe(-5 * 37); // months 24 to 60
  });

  it("measures at the month it is asked for", () => {
    expect(run([ev("a", 12, { cost: 10 })], 24)[0].costDelta).toBe(10 * 13);
    expect(run([ev("a", 12, { cost: 10 })], 11)[0].costDelta).toBe(0); // not started yet
  });

  it("a decision that changes no cost has an effect of exactly zero", () => {
    expect(run([ev("a", 12, {})])[0].costDelta).toBe(0);
  });

  it("lists decisions in the order they happen", () => {
    expect(run([ev("late", 30, {}), ev("early", 6, {})]).map((e) => e.event.id)).toEqual(["early", "late"]);
  });

  it("titles each decision in words", () => {
    expect(run([ev("a", 12, { annualMiles: 20000 })])[0].title).toBe("20,000 miles a year");
  });

  it("ignores proposals: they are not part of the future yet", () => {
    expect(run([ev("p", 12, { cost: 10 }, "proposed"), ev("c", 12, { cost: 1 })]).map((e) => e.event.id)).toEqual(["c"]);
  });

  it("does not change the scenario it was given", () => {
    const s = scenario([ev("a", 12, { cost: 10 })]);
    decisionEffects({ scenario: s, result: fakeSimulate(s), month: 60, simulate: fakeSimulate });
    expect(s.events).toHaveLength(1);
  });

  it("says nothing rather than guess when a decision cannot be re-run", () => {
    const s = scenario([ev("a", 12, { cost: 10 }), ev("b", 24, { cost: 1 })]);
    let calls = 0;
    const out = decisionEffects({
      scenario: s,
      result: fakeSimulate(s),
      month: 60,
      simulate: (x) => {
        calls += 1;
        if (calls === 1) throw new Error("no spec sheet");
        return fakeSimulate(x);
      },
    });
    expect(out.map((e) => e.event.id)).toEqual(["b"]);
  });

  it("has no effects when there is no projection at that month", () => {
    const s = scenario([ev("a", 12, { cost: 10 })]);
    expect(decisionEffects({ scenario: s, result: undefined, month: 60, simulate: fakeSimulate })).toEqual([]);
    expect(decisionEffects({ scenario: s, result: fakeSimulate(s), month: 0, simulate: fakeSimulate })).toEqual([]);
  });

  it("notes when a decision changes how well the car fits", () => {
    const out = run([ev("kid", 36, { tight: 1 }), ev("move", 12, {})]);
    expect(out.find((e) => e.event.id === "kid")?.fitNote).toBe("Passenger fit goes from good to tight");
    expect(out.find((e) => e.event.id === "move")?.fitNote).toBeNull();
  });
});

describe("fitNote", () => {
  it("passengers first, then cargo, otherwise nothing", () => {
    expect(fitNote(fit("tight"), fit("good"))).toBe("Passenger fit goes from good to tight");
    expect(fitNote(fit("good", "insufficient"), fit("good", "good"))).toBe("Cargo fit goes from good to not enough");
    expect(fitNote(fit("good"), fit("good"))).toBeNull();
    expect(fitNote(fit("needs_verification"), fit("good"))).toBe("Passenger fit goes from good to unverified");
  });
});
