import { describe, expect, it } from "vitest";
import { mileageFactor, retainedFraction, vehicleValue } from "../depreciation";
import { amortizeStep, impliedApr, loanPayment } from "../financing";
import { fuelCost } from "../fuel";
import { dueBetween, occurrencesUpTo } from "../maintenance";
import { camrySpec } from "./fixtures";

const dep = camrySpec.depreciation;

describe("fuel", () => {
  it("12,000 mi at 28 mpg and $3.00/gal is $1,285.71 a year", () => {
    expect(fuelCost(12000, 28, 3).toFixed(2)).toBe("1285.71");
  });
  it("zero miles or bad mpg cost nothing", () => {
    expect(fuelCost(0, 28, 3)).toBe(0);
    expect(fuelCost(1000, 0, 3)).toBe(0);
  });
});

describe("financing", () => {
  it("$20,000 at 6% APR for 60 months is $386.66 a month", () => {
    expect(loanPayment(20000, 0.06, 60).toFixed(2)).toBe("386.66");
  });
  it("zero APR splits evenly", () => {
    expect(loanPayment(12000, 0, 60)).toBe(200);
  });
  it("implied APR recovers the rate behind a payment", () => {
    expect(impliedApr(20000, loanPayment(20000, 0.06, 60), 60)).toBeCloseTo(0.06, 8);
    expect(impliedApr(12000, 200, 60)).toBe(0);
    expect(impliedApr(12000, 150, 60)).toBe(0); // underpays even at 0%
  });
  it("amortizing the full term pays the loan off exactly", () => {
    const pay = loanPayment(20000, 0.06, 60);
    let bal = 20000, interest = 0;
    for (let i = 0; i < 60; i++) { const s = amortizeStep(bal, 0.06, pay); bal = s.balance; interest += s.interest; }
    expect(bal).toBe(0);
    expect(interest).toBeCloseTo(pay * 60 - 20000, 6);
    expect(amortizeStep(20000, 0.06, pay).interest).toBeCloseTo(100, 10);
  });
  it("the last payment is capped at what is owed", () => {
    expect(amortizeStep(100, 0, 450)).toEqual({ interest: 0, principal: 100, paid: 100, balance: 0 });
  });
});

describe("depreciation", () => {
  it("follows the retained curve and interpolates between years", () => {
    expect(retainedFraction(dep, 0)).toBe(1);
    expect(retainedFraction(dep, 1)).toBeCloseTo(0.85);
    expect(retainedFraction(dep, 4)).toBeCloseTo(0.6);
    expect(retainedFraction(dep, 4.5)).toBeCloseTo(0.57);
  });
  it("extrapolates past the curve at the last drop and respects the floor", () => {
    expect(retainedFraction(dep, 6)).toBeCloseTo(0.48);
    expect(retainedFraction(dep, 40)).toBe(0.1);
  });
  it("scale makes depreciation gentler or steeper", () => {
    expect(retainedFraction(dep, 1, 0.8)).toBeCloseTo(0.88);
    expect(retainedFraction(dep, 1, 1.2)).toBeCloseTo(0.82);
  });
  it("adjusts for mileage against 12k mi/yr and clamps", () => {
    expect(mileageFactor(dep, 4, 48000)).toBe(1);
    expect(mileageFactor(dep, 4, 58000)).toBeCloseTo(0.98);
    expect(mileageFactor(dep, 4, 1_000_000)).toBe(0.5);
    expect(vehicleValue(28000, dep, 4, 48000)).toBeCloseTo(16800);
  });
});

describe("maintenance", () => {
  it("counts occurrences and lists each due task in a window", () => {
    const [rotation, , , fluids] = camrySpec.maintenance;
    expect(occurrencesUpTo(rotation, 4999)).toBe(0);
    expect(occurrencesUpTo(rotation, 10000)).toBe(2);
    expect(occurrencesUpTo({ atMiles: 30000, label: "once", costUsd: 1 }, 90000)).toBe(1);
    expect(dueBetween([fluids], 59000, 60000).map(d => d.atMiles)).toEqual([60000]);
    expect(dueBetween([fluids], 60000, 61000)).toEqual([]);
    expect(dueBetween(camrySpec.maintenance, 59000, 60000).map(d => d.task.label))
      .toEqual(["Tire rotation", "Oil change", "Filter service", "Fluids service"]);
  });
});
