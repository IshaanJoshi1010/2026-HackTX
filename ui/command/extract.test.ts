import { describe, expect, it } from "vitest";
import { DEFAULT_MONTH, extractEvents } from "./extract";

const NOW = 2026;
const DEMO = "Moving to Denver next year, 20,000 miles annually, second child in 2029";

describe("extractEvents: the demo sentence", () => {
  it("finds the move, the mileage and the child, with the user's own words", () => {
    const events = extractEvents(DEMO, NOW);
    expect(events.map((e) => e.type)).toEqual(["relocation", "mileage_change", "family_change"]);
    expect(events.map((e) => e.quote)).toEqual(["Moving to Denver next year", "20,000 miles annually", "second child in 2029"]);
  });

  it("uses the keys the simulation reads", () => {
    const [move, miles, kid] = extractEvents(DEMO, NOW);
    expect(move.payload).toEqual({ location: "Denver" });
    expect(miles.payload).toEqual({ annualMiles: 20000 });
    expect(kid.payload).toEqual({ childrenDelta: 1 });
  });

  it("reads the timing: next year, carried forward, then 2029", () => {
    const [move, miles, kid] = extractEvents(DEMO, NOW);
    expect([move.month, move.certainty]).toEqual([12, "clear"]);
    expect([miles.month, miles.certainty]).toEqual([12, "inferred"]);
    expect(miles.assumptions[0]).toMatch(/time from the change before/);
    expect([kid.month, kid.certainty]).toEqual([36, "clear"]);
  });

  it("never marks anything confirmed and never writes an id", () => {
    for (const e of extractEvents(DEMO, NOW)) {
      expect(e).not.toHaveProperty("status");
      expect(e).not.toHaveProperty("id");
      expect(e.source).toBe("user");
    }
  });
});

describe("extractEvents: extract, never invent", () => {
  it("returns nothing for text with no life change in it", () => {
    expect(extractEvents("hello there", NOW)).toEqual([]);
    expect(extractEvents("", NOW)).toEqual([]);
    expect(extractEvents("   ", NOW)).toEqual([]);
  });

  it("does not invent a city when none is named", () => {
    expect(extractEvents("I'm moving", NOW)).toEqual([]);
    expect(extractEvents("moving soon", NOW)).toEqual([]);
    expect(extractEvents("moving to", NOW)).toEqual([]);
  });

  it("does not invent mileage from the word commute", () => {
    expect(extractEvents("my commute is changing", NOW)).toEqual([]);
  });

  it("does not turn a one-way commute distance into annual miles", () => {
    expect(extractEvents("commute changing to 40 miles one way", NOW)).toEqual([]);
    expect(extractEvents("it is 12 miles to work", NOW)).toEqual([]);
  });

  it("does not invent a fuel price from the word gas", () => {
    expect(extractEvents("gas is getting expensive", NOW)).toEqual([]);
  });

  it("only takes a fuel price the user wrote", () => {
    const [e] = extractEvents("fuel going to $4.50 per gallon", NOW);
    expect(e.type).toBe("fuel_price_change");
    expect(e.payload).toEqual({ fuelPricePerGal: 4.5 });
  });

  it("does not invent how many children or the household size", () => {
    const [e] = extractEvents("we're expecting", NOW);
    expect(e.payload).toEqual({ childrenDelta: 1 });
    expect(e.payload).not.toHaveProperty("householdSize");
    expect(e.payload).not.toHaveProperty("children");
  });
});

describe("extractEvents: timing is labeled, never silently assumed", () => {
  it("uses a labeled default month when the user did not say when", () => {
    const [e] = extractEvents("moving to Austin", NOW);
    expect(e.month).toBe(DEFAULT_MONTH);
    expect(e.certainty).toBe("inferred");
    expect(e.assumptions[0]).toMatch(/didn't say when/);
  });

  it.each([
    ["moving to Boise next month", 1],
    ["moving to Boise in 2 years", 24],
    ["moving to Boise in 6 months", 6],
    ["moving to Boise in 2028", 24],
  ])("reads %s as month %d", (text, month) => {
    const [e] = extractEvents(text, NOW);
    expect(e.month).toBe(month);
    expect(e.certainty).toBe("clear");
    expect(e.assumptions).toEqual([]);
  });

  it("keeps months on the 60 month axis", () => {
    expect(extractEvents("moving to Boise in 2040", NOW)[0].month).toBe(60);
    expect(extractEvents("moving to Boise in 2020", NOW)[0].month).toBe(0);
  });

  it("does not read a mileage figure as a year", () => {
    const [e] = extractEvents("driving 2030 miles per year", NOW);
    expect(e.type).toBe("mileage_change");
    expect(e.payload).toEqual({ annualMiles: 2030 });
    expect(e.month).toBe(DEFAULT_MONTH);
  });
});

describe("extractEvents: wording", () => {
  it("handles k, commas and lowercase cities", () => {
    const events = extractEvents("relocating to new york in 3 years, 15k miles a year", NOW);
    expect(events[0].payload).toEqual({ location: "New York" });
    expect(events[0].month).toBe(36);
    expect(events[1].payload).toEqual({ annualMiles: 15000 });
  });

  it("needs a yearly figure for small mileage numbers", () => {
    expect(extractEvents("500 miles per year", NOW)[0].payload).toEqual({ annualMiles: 500 });
    expect(extractEvents("500 miles", NOW)).toEqual([]);
  });
});
