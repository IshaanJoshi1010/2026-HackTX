import { describe, expect, it } from "vitest";
import { eventDetail, eventTitle } from "./eventLabels";

describe("eventTitle says what the decision is", () => {
  it.each([
    [{ type: "relocation", payload: { location: "Denver" } }, "Move to Denver"],
    [{ type: "relocation", payload: { city: "Austin" } }, "Move to Austin"], // older saves
    [{ type: "relocation", payload: {} }, "Move"],
    [{ type: "mileage_change", payload: { annualMiles: 20000 } }, "20,000 miles a year"],
    [{ type: "mileage_change", payload: {} }, "Driving change"],
    [{ type: "family_change", payload: { childrenDelta: 1 } }, "New child"],
    [{ type: "family_change", payload: { childrenDelta: 2 } }, "2 new children"],
    [{ type: "family_change", payload: { children: 2 } }, "Second child"], // the demo: an absolute count
    [{ type: "family_change", payload: { children: 3 } }, "Third child"],
    [{ type: "family_change", payload: { children: 5 } }, "5 children"],
    [{ type: "family_change", payload: {} }, "Family change"],
    [{ type: "fuel_price_change", payload: { fuelPricePerGal: 4.5 } }, "Fuel $4.50 a gallon"],
    [{ type: "vehicle_replacement", payload: { vehicleId: "x" } }, "Replace car"],
  ] as const)("%j -> %s", (e, title) => {
    expect(eventTitle(e)).toBe(title);
  });

  it("never prints a number it was not given", () => {
    expect(eventTitle({ type: "mileage_change", payload: { annualMiles: "lots" } })).toBe("Driving change");
  });
});

describe("eventDetail", () => {
  const e = (type: Parameters<typeof eventTitle>[0]["type"], payload: Record<string, number | string>) => ({ type, payload });

  it("says what a budget or cargo change sets, which the title alone does not", () => {
    expect(eventDetail(e("budget_change", { monthlyBudget: 900 }))).toBe("$900 a month");
    expect(eventDetail(e("cargo_change", { cargoNeed: "high" }))).toBe("High cargo need");
  });

  it("says a commute in words", () => {
    expect(eventDetail(e("mileage_change", { commuteMilesOneWay: 18, commuteDaysPerWeek: 4 }))).toBe("18 miles each way, 4 days a week");
    expect(eventDetail(e("mileage_change", { commuteDaysPerWeek: 3 }))).toBe("3 days a week");
  });

  it("is null when the title is the whole story, and never invents a value", () => {
    expect(eventDetail(e("relocation", { location: "Denver" }))).toBeNull();
    expect(eventDetail(e("mileage_change", { annualMiles: 20000 }))).toBeNull();
    expect(eventDetail(e("budget_change", {}))).toBeNull();
    expect(eventDetail(e("cargo_change", { cargoNeed: 3 }))).toBeNull();
  });
});
