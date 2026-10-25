import { describe, expect, it } from "vitest";
import { extractEvents, interpretOffline } from "./extract";

// The demo's own date: months are measured from here, not from the clock.
const TODAY = "2026-10-24";
const DEMO = "I'm moving to Denver next year, driving 20,000 miles annually, and expecting my second child in 2029.";
const SHORT = "Moving to Denver next year, 20,000 miles annually, second child in 2029";

describe("extractEvents: the demo sentence", () => {
  it("finds the move, the mileage and the child, with the user's own words", () => {
    const events = extractEvents(DEMO, TODAY);
    expect(events.map((e) => e.type)).toEqual(["relocation", "mileage_change", "family_change"]);
    expect(events.map((e) => e.quote)).toEqual([
      "I'm moving to Denver next year",
      "driving 20,000 miles annually",
      "expecting my second child in 2029",
    ]);
  });

  it("gives exactly the events Dev 4's demo story is pinned on (type, month, payload)", () => {
    const got = extractEvents(DEMO, TODAY).map((e) => [e.type, e.month, e.payload]);
    expect(got).toEqual([
      ["relocation", 12, { location: "Denver" }],
      ["mileage_change", 0, { annualMiles: 20000 }],
      ["family_change", 32, { children: 2 }],
    ]);
  });

  it("the shorter phrasing gives the same events", () => {
    const key = (text: string) => extractEvents(text, TODAY).map((e) => [e.type, e.month, e.payload]);
    expect(key(SHORT)).toEqual(key(DEMO));
  });

  it("labels what it assumed: no time stated starts now, a bare year is June", () => {
    const [move, miles, kid] = extractEvents(DEMO, TODAY);
    expect([move.month, move.certainty, move.assumptions]).toEqual([12, "clear", []]);
    expect([miles.month, miles.certainty]).toEqual([0, "inferred"]);
    expect(miles.assumptions[0]).toMatch(/didn't say when/);
    expect([kid.month, kid.certainty]).toEqual([32, "inferred"]);
    expect(kid.assumptions[0]).toMatch(/June/);
  });

  it("never marks anything confirmed and never writes an id", () => {
    for (const e of extractEvents(DEMO, TODAY)) {
      expect(e).not.toHaveProperty("status");
      expect(e).not.toHaveProperty("id");
      expect(e.source).toBe("user");
    }
  });
});

describe("extractEvents: extract, never invent", () => {
  it("returns nothing for text with no life change in it", () => {
    expect(extractEvents("hello there", TODAY)).toEqual([]);
    expect(extractEvents("", TODAY)).toEqual([]);
    expect(extractEvents("   ", TODAY)).toEqual([]);
  });

  it("does not invent a city when none is named", () => {
    expect(extractEvents("I'm moving", TODAY)).toEqual([]);
    expect(extractEvents("moving soon", TODAY)).toEqual([]);
    expect(extractEvents("moving to", TODAY)).toEqual([]);
  });

  it("does not invent mileage from the word commute", () => {
    expect(extractEvents("my commute is changing", TODAY)).toEqual([]);
  });

  it("does not turn a one-way commute distance into annual miles", () => {
    expect(extractEvents("commute changing to 40 miles one way", TODAY)).toEqual([]);
    expect(extractEvents("it is 12 miles to work", TODAY)).toEqual([]);
  });

  it("does not invent a fuel price from the word gas", () => {
    expect(extractEvents("gas is getting expensive", TODAY)).toEqual([]);
  });

  it("only takes a fuel price the user wrote", () => {
    const [e] = extractEvents("fuel going to $4.50 per gallon", TODAY);
    expect(e.type).toBe("fuel_price_change");
    expect(e.payload).toEqual({ fuelPricePerGal: 4.5 });
  });

  it("does not invent how many children or the household size", () => {
    const [e] = extractEvents("we're expecting", TODAY);
    expect(e.payload).toEqual({ childrenDelta: 1 });
    expect(e.payload).not.toHaveProperty("householdSize");
    expect(e.payload).not.toHaveProperty("children");
  });

  it("an ordinal is a count the user gave; 'another' only adds one", () => {
    expect(extractEvents("we're having our third child", TODAY)[0].payload).toEqual({ children: 3 });
    expect(extractEvents("another baby next year", TODAY)[0].payload).toEqual({ childrenDelta: 1 });
  });
});

describe("extractEvents: timing is labeled, never silently assumed", () => {
  it("starts a change with no time now, and says so", () => {
    const [e] = extractEvents("moving to Austin", TODAY);
    expect(e.month).toBe(0);
    expect(e.certainty).toBe("inferred");
    expect(e.assumptions[0]).toMatch(/didn't say when/);
  });

  it("does not borrow the time from the change before it", () => {
    const [, miles] = extractEvents("moving to Boise next year, 15,000 miles a year", TODAY);
    expect(miles.month).toBe(0);
  });

  it("an expected child with no time is about nine months out, flagged to confirm", () => {
    const [e] = extractEvents("we're expecting", TODAY);
    expect([e.month, e.certainty]).toEqual([9, "inferred"]);
    expect(e.assumptions[0]).toMatch(/9 months/);
  });

  it.each([
    ["moving to Boise next month", 1],
    ["moving to Boise in 2 years", 24],
    ["moving to Boise in 6 months", 6],
  ])("reads %s as month %d, clearly", (text, month) => {
    const [e] = extractEvents(text, TODAY);
    expect(e.month).toBe(month);
    expect(e.certainty).toBe("clear");
    expect(e.assumptions).toEqual([]);
  });

  it("a bare year is June of that year, counted from the date given", () => {
    expect(extractEvents("moving to Boise in 2028", TODAY)[0].month).toBe(20);
    expect(extractEvents("moving to Boise in 2028", "2026-06-01")[0].month).toBe(24);
    expect(extractEvents("moving to Boise in 2028", TODAY)[0].certainty).toBe("inferred");
  });

  it("keeps months on the 60 month axis", () => {
    expect(extractEvents("moving to Boise in 2040", TODAY)[0].month).toBe(60);
    expect(extractEvents("moving to Boise in 2020", TODAY)[0].month).toBe(0);
  });

  it("does not read a mileage figure as a year", () => {
    const [e] = extractEvents("driving 2030 miles per year", TODAY);
    expect(e.type).toBe("mileage_change");
    expect(e.payload).toEqual({ annualMiles: 2030 });
    expect(e.month).toBe(0);
  });
});

describe("extractEvents: wording", () => {
  it("handles k, commas and lowercase cities", () => {
    const events = extractEvents("relocating to new york in 3 years, 15k miles a year", TODAY);
    expect(events[0].payload).toEqual({ location: "New York" });
    expect(events[0].month).toBe(36);
    expect(events[1].payload).toEqual({ annualMiles: 15000 });
  });

  it("needs a yearly figure for small mileage numbers", () => {
    expect(extractEvents("500 miles per year", TODAY)[0].payload).toEqual({ annualMiles: 500 });
    expect(extractEvents("500 miles", TODAY)).toEqual([]);
  });
});

describe("interpretOffline: what the user is asking for", () => {
  it("a statement with changes in it is a scenario to confirm", () => {
    const r = interpretOffline(DEMO, TODAY);
    expect(r.intent).toBe("CREATE_SCENARIO");
    expect(r.events).toHaveLength(3);
  });

  it("'would a RAV4 make more sense?' asks to compare, and creates nothing", () => {
    for (const q of [
      "Would switching to a RAV4 Hybrid make more sense?",
      "should I replace my Camry?",
      "is it worth trading in my car?",
    ]) {
      expect(interpretOffline(q, TODAY)).toEqual({ intent: "COMPARE_SCENARIOS", events: [] });
    }
  });

  it("'what would have to change…' asks for the break-even, and creates nothing", () => {
    for (const q of [
      "What would have to change for keeping the Camry to be the better option?",
      "What would make keeping my Camry better?",
      "how low would my mileage need to be?",
      "where is the break-even?",
      "What fuel price would have to change for keeping the Camry to be the better option?",
      "At what gas price would keeping the Camry win?",
    ]) {
      expect(interpretOffline(q, TODAY)).toEqual({ intent: "FIND_BREAK_EVEN", events: [] });
    }
  });

  it("a question about some other car is not answered with the RAV4", () => {
    const r = interpretOffline("Would a Corolla make more sense?", TODAY);
    expect(r.intent).toBe("CLARIFY");
    expect(r.events).toEqual([]);
    expect(r.note).toMatch(/RAV4/);
  });

  it("chatter and statements with no change do nothing", () => {
    for (const t of ["hi", "I like the RAV4", "thanks!", ""]) {
      expect(interpretOffline(t, TODAY)).toEqual({ intent: "CLARIFY", events: [] });
    }
  });

  it("a question that also states a change makes a scenario first; nothing is compared until it is confirmed", () => {
    const r = interpretOffline("If I move to Denver next year, would a RAV4 make more sense?", TODAY);
    expect(r.intent).toBe("CREATE_SCENARIO");
    expect(r.events.map((e) => e.type)).toEqual(["relocation"]);
  });
});
