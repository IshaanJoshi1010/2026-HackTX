import { describe, expect, it } from "vitest";
import { eventTitle } from "./eventLabels";

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
