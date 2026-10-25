import { describe, expect, it } from "vitest";
import { ai } from "@/ui/mocks";

/**
 * The app reads a sentence with Dev 3's shared offline reader whenever the AI is not available (no key,
 * no network, a failure, a quota or a cooldown). These pin what the app relies on from it. If one of them
 * fails after a merge, the offline demo has changed and needs a look before anyone relies on it.
 */
const TODAY = "2026-10-24"; // the demo's own date: months count from here, never from the clock
const read = (text: string) => ai.interpretOffline(text, TODAY);
const shape = (text: string) => read(text).events.map((e) => [e.type, e.month, e.payload]);

const DEMO = "I'm moving to Denver next year, driving 20,000 miles annually, and expecting my second child in 2029.";
const PINNED = [
  ["relocation", 12, { location: "Denver" }],
  ["mileage_change", 0, { annualMiles: 20000 }],
  ["family_change", 32, { children: 2 }],
];

describe("the demo sentence, offline", () => {
  it("gives exactly the events Dev 4's demo story is pinned on (type, month, payload)", () => {
    expect(shape(DEMO)).toEqual(PINNED);
    expect(read(DEMO).intent).toBe("CREATE_SCENARIO");
  });

  it("the shorter phrasing gives the same events", () => {
    expect(shape("Moving to Denver next year, 20,000 miles annually, second child in 2029")).toEqual(PINNED);
  });

  it("keeps the person's own words, and marks the guessed month (a bare year) as inferred", () => {
    const [move, miles, kid] = read(DEMO).events;
    expect(move.quote).toMatch(/moving to Denver next year/i);
    expect(miles.quote).toMatch(/20,000 miles annually/);
    expect([move.certainty, miles.certainty, kid.certainty]).toEqual(["clear", "clear", "inferred"]);
  });

  it("never confirms anything and never writes an id: the store stages every event as a proposal", () => {
    for (const e of read(DEMO).events) {
      expect(e).not.toHaveProperty("id");
      expect(e).not.toHaveProperty("status");
    }
  });
});

describe("what it will not guess", () => {
  const nothing = (text: string) => {
    const r = read(text);
    expect(r.events, text).toEqual([]);
    expect(r.intent, text).toBe("CLARIFY");
    return r;
  };

  it("a negative or a correction is never applied", () => {
    expect(nothing("I'm not pregnant.").note).toMatch(/negatives|confirm/i);
    nothing("I'm not moving to Denver");
    nothing("actually, make that Seattle");
  });

  it("an odometer reading is not annual driving", () => {
    nothing("My car has 48,000 miles on it.");
    nothing("500 miles");
  });

  it("a commute is not annual miles", () => {
    for (const e of read("commute changing to 40 miles one way").events) expect(e.payload).not.toHaveProperty("annualMiles");
    nothing("it is 12 miles to work");
  });

  it("dates it cannot place are explained, not clamped to the end of the road or turned into now", () => {
    expect(nothing("I'm moving to Seattle in 10 years").note).toMatch(/five-year|timing/i);
    // A season is not left unplaced: it becomes an inferred month, and says so where the confirm card shows it.
    const summer = read("I'm moving to Seattle next summer").events;
    expect(summer).toHaveLength(1);
    expect(summer[0]).toMatchObject({ type: "relocation", month: 8, certainty: "inferred", payload: { location: "Seattle" } });
    expect(summer[0].assumptions.join(" ")).toMatch(/june 2027.*confirm or correct/i);
    nothing("moving to Boise in 2040");
    nothing("moving to Boise in 2020"); // already past
  });

  it("chatter, vague talk and a missing place or amount make nothing up", () => {
    for (const t of ["hi", "thanks!", "I'm moving", "moving soon", "my commute is changing", "gas is getting expensive", ""]) nothing(t);
  });

  it("a hypothetical or a question that mentions a change makes no change", () => {
    expect(read("what if I moved to Denver next year").events).toEqual([]);
    expect(read("if I move to Denver next year, would a RAV4 make more sense?").events).toEqual([]);
  });
});

describe("what it does read", () => {
  it("timing the way people say it, counted from the session's date", () => {
    expect(shape("moving to Boise next month")[0]).toEqual(["relocation", 1, { location: "Boise" }]);
    expect(shape("moving to Boise in 2 years")[0][1]).toBe(24);
    expect(shape("moving to Boise in six months")[0][1]).toBe(6);
    expect(shape("moving to Denver this December")[0][1]).toBe(2);
    expect(shape("moving to Boise in March 2027")[0][1]).toBe(5);
  });

  it("a bare year is June of that year, and says so", () => {
    const [e] = read("moving to Boise in 2028").events;
    expect([e.month, e.certainty]).toEqual([20, "inferred"]);
  });

  it("the amounts it is given: zero miles, thousands, a fuel price, a budget, an ordinal child", () => {
    expect(shape("driving 0 miles a year")[0]).toEqual(["mileage_change", 0, { annualMiles: 0 }]);
    expect(shape("driving 20k miles a year")[0][2]).toEqual({ annualMiles: 20000 });
    expect(shape("fuel going to $4.50 per gallon")[0][2]).toEqual({ fuelPricePerGal: 4.5 });
    expect(shape("my budget is $500 a month")[0][2]).toEqual({ monthlyBudget: 500 });
    expect(shape("we're having our third child")[0][2]).toEqual({ children: 3 });
  });

  it("an expected child is about nine months out, flagged to confirm, with no household size invented", () => {
    const [e] = read("my wife is pregnant").events;
    expect([e.type, e.month, e.certainty]).toEqual(["family_change", 9, "inferred"]);
    expect(e.payload).not.toHaveProperty("householdSize");
  });
});

describe("questions: routed, and they create no events", () => {
  it.each([
    ["Would switching to a RAV4 Hybrid make more sense?", "COMPARE_SCENARIOS"],
    ["Should I replace my Camry?", "COMPARE_SCENARIOS"],
    ["What would have to change for keeping the Camry to be the better option?", "FIND_BREAK_EVEN"],
    ["how low would my mileage need to be?", "FIND_BREAK_EVEN"],
    ["Why is it a close call?", "EXPLAIN_RESULT"],
  ])("%s -> %s", (text, intent) => {
    expect(read(text)).toEqual({ intent, events: [] });
  });

  it("a question about some other car is not answered with the RAV4", () => {
    const r = read("Would a Corolla make more sense?");
    expect(r.intent).toBe("CLARIFY");
    expect(r.note).toMatch(/Camry SE|RAV4/);
  });
});
