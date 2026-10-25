import { describe, expect, it } from "vitest";
import type { BreakEvenResult, DriverProfile, LifeEvent, Scenario } from "@/contracts";
import type { BreakEvenCheck } from "@/ui/store/useForkStore";
import { annualMilesSource, breakEvenCopy, formatParameter, fractionAlong } from "./breakEvenMath";

const names = { keepId: "keep", replaceId: "replace", keepName: "the Camry", replaceName: "the RAV4" };

const found: BreakEvenResult = {
  found: true,
  parameter: "annualMiles",
  threshold: 14433.59375,
  unit: "mi/yr",
  direction: "below",
  currentValue: 20000,
  testedBounds: [5000, 40000],
};
const check: BreakEvenCheck = {
  below: { value: 14408.2, preferredScenarioId: "keep", netCost: { keep: 25000, replace: 27000 } },
  above: { value: 14459, preferredScenarioId: "inconclusive", netCost: { keep: 25100, replace: 26900 } },
};

describe("formatParameter", () => {
  it("prints miles with commas and fuel price in dollars", () => {
    expect(formatParameter("annualMiles", 14433.59375)).toBe("14,434 mi/yr");
    expect(formatParameter("fuelPricePerGal", 4.125)).toBe("$4.13/gal");
  });
});

describe("fractionAlong", () => {
  it("places a value on the tested range and pins what is outside it", () => {
    expect(fractionAlong(5000, [5000, 40000])).toBe(0);
    expect(fractionAlong(40000, [5000, 40000])).toBe(1);
    expect(fractionAlong(22500, [5000, 40000])).toBeCloseTo(0.5, 10);
    expect(fractionAlong(1, [5000, 40000])).toBe(0);
    expect(fractionAlong(99999, [5000, 40000])).toBe(1);
  });
  it("does not divide by a range with no width", () => {
    expect(fractionAlong(5, [3, 3])).toBe(0);
  });
});

describe("breakEvenCopy: a threshold was found", () => {
  const copy = breakEvenCopy({ breakEven: found, check, ...names });

  it("says who wins on which side of it, from the rerun, in words", () => {
    expect(copy.headline).toBe("Keeping the Camry wins below 14,434 mi/yr");
  });

  it("says where the plan stands today", () => {
    expect(copy.today).toBe("In this plan: 20,000 mi/yr");
  });

  it("gives the two reruns so the flip can be checked by typing the numbers in", () => {
    expect(copy.rows).toEqual([
      { side: "below", at: "14,408 mi/yr", leads: "Keeping the Camry leads", keepNet: 25000, replaceNet: 27000 },
      { side: "above", at: "14,459 mi/yr", leads: "No clear winner", keepNet: 25100, replaceNet: 26900 },
    ]);
  });

  it("names the other car when it is the one that wins past the threshold", () => {
    const flipped: BreakEvenResult = { ...found, direction: "above", threshold: 30000 };
    const c = breakEvenCopy({
      breakEven: flipped,
      check: {
        below: { value: 29900, preferredScenarioId: "keep", netCost: {} },
        above: { value: 30100, preferredScenarioId: "replace", netCost: {} },
      },
      ...names,
    });
    expect(c.headline).toBe("Switching to the RAV4 wins above 30,000 mi/yr");
    expect(c.rows[1].leads).toBe("Switching to the RAV4 leads");
    expect(c.rows[0].keepNet).toBeNull(); // no cost reported, so none is shown
  });

  it("does not guess who wins when the rerun is missing", () => {
    const c = breakEvenCopy({ breakEven: found, check: null, ...names });
    expect(c.headline).toBe("The answer changes below 14,434 mi/yr");
    expect(c.rows).toEqual([]);
  });

  it("works for fuel price too", () => {
    const fuel: BreakEvenResult = { ...found, parameter: "fuelPricePerGal", threshold: 5.5, currentValue: 3, unit: "$/gal", direction: "above", testedBounds: [2, 8] };
    const c = breakEvenCopy({
      breakEven: fuel,
      check: {
        below: { value: 5.47, preferredScenarioId: "keep", netCost: {} },
        above: { value: 5.53, preferredScenarioId: "replace", netCost: {} },
      },
      ...names,
    });
    expect(c.headline).toBe("Switching to the RAV4 wins above $5.50/gal");
    expect(c.today).toBe("In this plan: $3.00/gal");
  });
});

describe("breakEvenCopy: nothing was found", () => {
  it("says so plainly, with the range that was tested", () => {
    const none: BreakEvenResult = { found: false, parameter: "annualMiles", reason: "no_threshold_within_bounds", testedBounds: [5000, 40000] };
    const c = breakEvenCopy({ breakEven: none, check: null, ...names });
    expect(c.headline).toBe("Nothing between 5,000 mi/yr and 40,000 mi/yr changes the answer");
    expect(c.today).toBeNull();
    expect(c.rows).toEqual([]);
  });
});

describe("annualMilesSource", () => {
  const profile = (annualMiles?: DriverProfile["provenance"][string]): DriverProfile => ({
    location: "Austin, TX",
    annualMiles: 12000,
    householdSize: 3,
    children: 1,
    carSeats: 0,
    cargoNeed: "low",
    fuelPricePerGal: 3,
    financeType: "loan",
    priorities: { cost: 0.2, family: 0.2, longevity: 0.2, fuel: 0.2, comfort: 0.2 },
    provenance: annualMiles ? { annualMiles } : {},
  });
  const ev = (status: LifeEvent["status"], payload: LifeEvent["payload"]): LifeEvent => ({
    id: "e",
    type: "mileage_change",
    month: 0,
    payload,
    source: "ai",
    assumptions: [],
    certainty: "clear",
    status,
  });
  const scenario = (events: LifeEvent[]): Scenario => ({ id: "s", parentId: null, forkMonth: 0, name: "s", events, assumptions: {} });

  it("is the user's when they said it and confirmed it", () => {
    expect(annualMilesSource(scenario([ev("confirmed", { annualMiles: 20000 })]), profile("synthetic"))).toBe("user");
  });
  it("is the profile's when no confirmed mileage was said", () => {
    expect(annualMilesSource(scenario([ev("proposed", { annualMiles: 20000 })]), profile("synthetic"))).toBe("synthetic");
    expect(annualMilesSource(undefined, profile("estimated"))).toBe("estimated");
  });
  it("shows the gap rather than inventing a source", () => {
    expect(annualMilesSource(undefined, profile())).toBeUndefined();
  });
});
