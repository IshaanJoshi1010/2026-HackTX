import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { InterpretContext } from "../contracts";
import { hasNumericEvidence } from "./evidence";
import { mapExtraction } from "./mapper";
import { interpretOffline } from "./offline";
import type { ExtractionItem } from "./schema";

/**
 * Regression tests for audit findings A2 to A5: the offline parser and the mapper that both read a sentence.
 * Every reproduction from AUDIT_FINDINGS.md is here, plus the demo sentence in three phrasings with Gemini off.
 * Months count from the demo's own date, never from the clock.
 */
const TODAY = "2026-10-24";
const read = (text: string) => interpretOffline(text, TODAY);
const shape = (text: string) => read(text).events.map((e) => [e.type, e.month, e.payload, e.certainty]);
const context: InterpretContext = { vehicle: { make: "Toyota", model: "Camry", year: 2022, trim: "SE" }, profile: {}, existingEvents: [], todayISO: TODAY };
const item = (field: ExtractionItem["field"], value: number | string, quote: string, month?: string, certainty: ExtractionItem["certainty"] = "clear"): ExtractionItem =>
  ({ field, value, certainty, quote, assumptions: [], ...(month ? { month } : {}) });
const mapped = (prompt: string, items: ExtractionItem[]) => mapExtraction({ intent: "CREATE_SCENARIO", items }, context, prompt);
const proposals = (prompt: string, items: ExtractionItem[]) => {
  const r = mapped(prompt, items).result;
  return r.aiAvailable ? r.proposals.map((e) => [e.type, e.month, e.payload]) : [];
};
const nothing = (text: string) => {
  const r = read(text);
  expect(r.events, text).toEqual([]);
  expect(r.intent, text).toBe("CLARIFY");
  return r;
};

describe("A2: a valid change is not thrown away because of an ' and ' in the sentence", () => {
  it("offline: 'moving to Denver next year and driving 20,000 miles annually' keeps both changes", () => {
    expect(shape("I'm moving to Denver next year and driving 20,000 miles annually")).toEqual([
      ["relocation", 12, { location: "Denver" }, "clear"],
      ["mileage_change", 0, { annualMiles: 20000 }, "clear"],
    ]);
  });

  it("offline: 'my wife is pregnant and we are moving to Denver next year' keeps both, and the child is not dated next year", () => {
    const events = shape("My wife is pregnant and we are moving to Denver next year");
    expect(events.map((e) => [e[0], e[1]])).toEqual([["family_change", 9], ["relocation", 12]]);
  });

  it("the AI path (mapper) has the same rule: the date belongs to the clause it is in", () => {
    const prompt = "I'm moving to Denver next year and driving 20,000 miles annually";
    expect(proposals(prompt, [
      item("location", "Denver", "moving to Denver next year", "next year"),
      item("annualMiles", 20000, "driving 20,000 miles annually"),
    ])).toEqual([["relocation", 12, { location: "Denver" }], ["mileage_change", 0, { annualMiles: 20000 }]]);

    const wife = "My wife is pregnant and we are moving to Denver next year";
    expect(proposals(wife, [
      item("childrenDelta", 1, "My wife is pregnant", undefined, "inferred"),
      item("location", "Denver", "we are moving to Denver next year", "next year"),
    ]).map((e) => [e[0], e[1]])).toEqual([["family_change", 9], ["relocation", 12]]);
  });

  it("but an undated value whose OWN clause names a date is still refused, not dated 'now'", () => {
    expect(proposals("I'm driving 20,000 miles annually from next year", [item("annualMiles", 20000, "driving 20,000 miles annually from next year")])).toEqual([]);
  });
});

describe("A3: a date in a different clause is never silently dropped", () => {
  it.each([
    "moving to San Antonio, TX next year",
    "Moving to Denver, Colorado next year",
    "I commute 20 miles each way, 5 days a week, starting next year",
  ])("offline: %s asks, instead of landing at month 0", (text) => {
    expect(nothing(text).note).toMatch(/date|when|manual/i);
  });

  it("the AI path refuses the same thing: no event at month 0 for a date it could not place", () => {
    const prompt = "moving to San Antonio, TX next year";
    const r = mapped(prompt, [item("location", "San Antonio", "moving to San Antonio")]);
    expect(r.result.aiAvailable && r.result.proposals).toEqual([]);
    expect(r.result.aiAvailable && r.result.intent).toBe("CLARIFY");
  });

  it("the AI path accepts it when the quote carries the date", () => {
    expect(proposals("moving to San Antonio, TX next year", [item("location", "San Antonio, TX", "moving to San Antonio, TX next year", "next year")])).toEqual([
      ["relocation", 12, { location: "San Antonio, TX" }],
    ]);
  });

  it("every date is carried by its own change in the demo sentence, so it is not refused", () => {
    expect(shape("I'm moving to Denver next year, driving 20,000 miles annually, and expecting my second child in 2029.").map((e) => e[1])).toEqual([12, 0, 32]);
  });

  it("words like 'by train' are not dates, so an extra clause does not sink a valid change", () => {
    expect(shape("I'm moving to Denver next year, and my commute will be by train")).toEqual([["relocation", 12, { location: "Denver" }, "clear"]]);
  });

  it("a real date in an extra clause that goes with no change still asks", () => {
    nothing("I'm moving to Denver, and in 2027 I'll retire");
  });
});

describe("A4: a pregnancy is an expected child about nine months out, never a child now", () => {
  it.each([
    "My wife is pregnant with our second child",
    "We're expecting our second child",
    "My wife is expecting our second child",
  ])("%s lands at month 9, inferred", (text) => {
    const [only, ...rest] = read(text).events;
    expect(rest).toEqual([]);
    expect(only.type).toBe("family_change");
    expect([only.month, only.certainty]).toEqual([9, "inferred"]);
    expect(only.assumptions.join(" ")).toMatch(/month 9|nine months/i);
  });

  it("an explicit date still wins over the nine month default", () => {
    const [only] = read("We're expecting our second child in 2029").events;
    expect([only.month, only.certainty]).toEqual([32, "inferred"]);
  });

  it("the count the person gave is kept (second child is two children in total)", () => {
    expect(read("My wife is pregnant with our second child").events[0].payload).toEqual({ children: 2 });
  });

  it("pregnant or expecting with no count is one more child", () => {
    expect(shape("my wife is pregnant")).toEqual([["family_change", 9, { childrenDelta: 1 }, "inferred"]]);
    expect(shape("we're expecting a baby")).toEqual([["family_change", 9, { childrenDelta: 1 }, "inferred"]]);
  });

  it("'expecting' something else is not a child", () => {
    nothing("we're expecting a raise next year");
  });

  it("a child that is not a pregnancy keeps its stated count and date", () => {
    expect(shape("We're having our third child next year")).toEqual([["family_change", 12, { children: 3 }, "clear"]]);
  });

  it("the AI path dates a pregnancy the same way", () => {
    const [only] = proposals("We're expecting our second child", [item("children", 2, "expecting our second child", undefined, "inferred")]);
    expect([only[0], only[1], only[2]]).toEqual(["family_change", 9, { children: 2 }]);
  });
});

describe("A5: an amount a year is not annual miles, and days a week is not a commute by itself", () => {
  it.each(["I make 90k a year", "I pay 1,200 a year in insurance", "I earn 85,000 per year", "I save 500 a year"])("%s makes no change", (text) => {
    nothing(text);
  });

  it("'I work 5 days a week' is not a commute", () => {
    nothing("I work 5 days a week");
  });

  it("but days a week with a commute is, with the distance", () => {
    const [only] = read("I commute 20 miles each way, 5 days a week").events;
    expect(only.type).toBe("mileage_change");
    expect(only.payload).toEqual({ commuteMilesOneWay: 20, commuteDaysPerWeek: 5 });
    expect(only.month).toBe(0);
  });

  it("but a driving verb in front of the amount is enough: 'I drive 15k a year' is one of the team's authored test sentences", () => {
    expect(shape("I drive 15k a year")[0][2]).toEqual({ annualMiles: 15000 });
    expect(shape("we're driving about 12,000 a year")[0][2]).toEqual({ annualMiles: 12000 });
    expect(hasNumericEvidence("annualMiles", 15000, "I drive 15k a year")).toBe(true);
    nothing("I drive a Camry and make 90k a year"); // the verb has to sit right in front of the amount
  });

  it("annual miles still need the word miles (or mi) with a year", () => {
    expect(shape("driving 20,000 miles annually")[0][2]).toEqual({ annualMiles: 20000 });
    expect(shape("I'll drive 20k miles a year")[0][2]).toEqual({ annualMiles: 20000 });
    expect(shape("about 15000 mi/yr")[0][2]).toEqual({ annualMiles: 15000 });
    expect(shape("20,000 annual miles")[0][2]).toEqual({ annualMiles: 20000 });
  });

  it("the evidence check agrees (the AI path uses it)", () => {
    expect(hasNumericEvidence("annualMiles", 90000, "I make 90k a year")).toBe(false);
    expect(hasNumericEvidence("annualMiles", 20000, "driving 20,000 miles annually")).toBe(true);
    expect(hasNumericEvidence("annualMiles", 1200, "I pay 1,200 a year in insurance")).toBe(false);
    expect(hasNumericEvidence("commuteDaysPerWeek", 5, "5 days a week")).toBe(false);
    expect(hasNumericEvidence("commuteDaysPerWeek", 5, "5 days a week", "I commute 20 miles each way, 5 days a week")).toBe(true);
    expect(hasNumericEvidence("commuteDaysPerWeek", 5, "I commute 5 days a week")).toBe(true);
  });

  it("the AI path refuses a salary read as miles", () => {
    expect(proposals("I make 90k a year", [item("annualMiles", 90000, "90k a year")])).toEqual([]);
  });
});

describe("the demo sentence in three phrasings, with Gemini off, gives the same events", () => {
  const phrasings = [
    "I'm moving to Denver next year, driving 20,000 miles annually, and expecting my second child in 2029.",
    "Moving to Denver next year, 20,000 miles annually, second child in 2029",
    "Next year I'm moving to Denver, I'll drive 20,000 miles annually, and we're expecting our second child in 2029.",
  ];
  const PINNED = [
    ["relocation", 12, { location: "Denver" }],
    ["mileage_change", 0, { annualMiles: 20000 }],
    ["family_change", 32, { children: 2 }],
  ];

  it.each(phrasings)("%s", (text) => {
    const r = read(text);
    expect(r.intent).toBe("CREATE_SCENARIO");
    expect(r.events.map((e) => [e.type, e.month, e.payload])).toEqual(PINNED);
    for (const e of r.events) {
      expect(e).not.toHaveProperty("id");
      expect(e).not.toHaveProperty("status"); // nothing is confirmed by the parser
    }
  });

  it("and the same through the server route with no key: the AI says 'not available', and these phrasings are what the app falls back to", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const { POST } = await import("../app/api/interpret/route");
    for (const prompt of phrasings) {
      const res = await POST(new Request("http://localhost/api/interpret", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt, context }) }));
      expect(await res.json()).toEqual({ aiAvailable: false });
      expect(read(prompt).events).toHaveLength(3);
    }
    vi.unstubAllEnvs();
  });
});
