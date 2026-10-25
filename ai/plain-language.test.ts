// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { interpretOffline } from "./offline";
import { createInterpreter } from "./interpret";
import { mapExtraction } from "./mapper";
import { resolveEventMonth } from "./dates";
const todayISO = "2026-10-25";
const context = { vehicle: { make: "Toyota", model: "Camry", year: 2022, trim: "SE" }, profile: { children: 1 }, existingEvents: [], todayISO };
const semantic = (text: string) => interpretOffline(text, todayISO).events.map(({ type, month, payload }) => ({ type, month, payload }));

describe("actual plain-language website failures", () => {
  it.each(["We're having a baby in March", "We are expecting a baby in March", "Our baby is due in March"])("proposes a new child for the upcoming March with an explicit year assumption: %s", text => {
    const read = interpretOffline(text, todayISO);
    expect(read.events).toHaveLength(1);
    expect(read.events[0]).toMatchObject({ type: "family_change", month: 5, payload: { childrenDelta: 1 }, certainty: "inferred" });
    expect(read.events[0].assumptions.join(" ")).toContain("2027");
    expect(read.events[0].assumptions.join(" ")).toContain("confirm");
  });
  it("allows the same raw bare month through the real mapper, leaving the confirmed child count alone", async () => {
    const text = "We're having a baby in March";
    const before = structuredClone(context);
    const result = await createInterpreter(async () => JSON.stringify({ intent: "CREATE_SCENARIO", items: [
      { field: "childrenDelta", value: 1, certainty: "inferred", quote: text, month: "in March", assumptions: [] },
    ] }))(text, context);
    expect(result.aiAvailable && result.proposals[0]).toMatchObject({ month: 5, payload: { childrenDelta: 1 }, status: "proposed" });
    expect(context).toEqual(before);
  });
  it("infers the upcoming occurrence of bare months without pretending the year was stated", () => {
    expect(resolveEventMonth("March", todayISO)).toMatchObject({ resolved: true, month: 5, inferred: true });
    expect(resolveEventMonth("in March", todayISO, true)).toMatchObject({ resolved: true, month: 5, inferred: true });
  });
  it("preserves the linked distance/schedule/date for a job 30 miles away", () => {
    const read = interpretOffline("I got a new job 30 miles away, so I'll be commuting 5 days a week starting in March 2027", todayISO);
    expect(read.events).toHaveLength(1);
    expect(read.events[0]).toMatchObject({ type: "mileage_change", month: 5,
      payload: { commuteMilesOneWay: 30, commuteDaysPerWeek: 5 }, certainty: "inferred" });
    expect(read.events[0].assumptions.join(" ")).toContain("one way");
    expect(read.events[0].payload).not.toHaveProperty("annualMiles");
  });
  it("rejects a model that dates only the schedule and silently applies the distance now", () => {
    const prompt = "I got a new job 30 miles away, so I'll be commuting 5 days a week starting in March 2027";
    const result = mapExtraction({ intent: "CREATE_SCENARIO", items: [
      { field: "commuteMilesOneWay", value: 30, quote: "I got a new job 30 miles away", certainty: "inferred", assumptions: [] },
      { field: "commuteDaysPerWeek", value: 5, quote: prompt, month: "in March 2027", certainty: "clear", assumptions: [] },
    ] }, context, prompt);
    expect(result.unresolved.some(item => item.field === "commuteMilesOneWay")).toBe(true);
  });
  it("offers an inferred US-season month for spring, requiring confirmation", async () => {
    const text = "I got a new job 30 miles away, so I'll be commuting 5 days a week starting in the spring";
    const read = interpretOffline(text, todayISO);
    expect(read.events[0]).toMatchObject({ month: 5, certainty: "inferred", payload: { commuteMilesOneWay: 30, commuteDaysPerWeek: 5 } });
    expect(read.events[0].assumptions.join(" ")).toContain("US-season");
    const result = await createInterpreter(async () => JSON.stringify({ intent: "CLARIFY", items: [] }))(text, context);
    expect(result).toEqual({ aiAvailable: false });
  });
  it("maps I am and I'm to the same three proposed changes, without date bleed", () => {
    const original = "I'm moving to Denver next year, driving 20,000 miles annually, and expecting my second child in 2029.";
    expect(semantic(original.replace("I'm", "I am"))).toEqual(semantic(original));
    expect(semantic(original)).toHaveLength(3);
  });
  it.each(["We're having a baby shower in March", "I am expecting a raise in March", "I won't be having a baby in March"])("does not invent a birth from: %s", text => {
    expect(semantic(text)).toEqual([]);
  });
});

describe("redundant births and independent partial changes", () => {
  it("does not count the same expected second child twice", () => {
    const text = "I'm expecting my second child in 2029";
    const base = { quote: text, month: "in 2029", certainty: "inferred", assumptions: [] };
    const mapped = mapExtraction({ intent: "CREATE_SCENARIO", items: [
      { ...base, field: "children", value: 2 }, { ...base, field: "childrenDelta", value: 1 },
    ] }, context, text);
    expect(mapped.result.aiAvailable && mapped.result.proposals[0].payload).toEqual({ children: 2 });
  });
  it("keeps an independent verified move while explaining the unsupported mileage", async () => {
    const text = "I'm moving to Denver next year; I drive lots of miles annually";
    const generate = vi.fn().mockResolvedValue(JSON.stringify({ intent: "CREATE_SCENARIO", items: [
      { field: "location", value: "Denver", quote: "I'm moving to Denver next year", month: "next year", certainty: "clear", assumptions: [] },
      { field: "annualMiles", value: 99000, quote: "I drive lots of miles annually", certainty: "clear", assumptions: [] },
    ] }));
    const result = await createInterpreter(generate)(text, context);
    expect(generate).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ aiAvailable: true, proposals: [{ payload: { location: "Denver" }, month: 12, status: "proposed" }], unsupportedReason: expect.any(String) });
  });
  it("does not ask a future-mileage question that this UI would apply to today's profile", async () => {
    const text = "I will drive way more next year";
    const result = await createInterpreter(async () => JSON.stringify({ intent: "CLARIFY", items: [
      { field: "annualMiles", value: null, quote: text, month: "next year", certainty: "vague", assumptions: [] },
    ], clarifyingQuestion: { field: "annualMiles", question: "How far?", options: ["Enter", "I'm not sure"] } }))(text, context);
    expect(result).not.toHaveProperty("question");
    expect(result.aiAvailable && result.proposals).toEqual([]);
  });
});

it("explains which retirement inputs are supported without inventing zero mileage", async () => {
  const text = "I'm retiring next year";
  const result = await createInterpreter(async () => JSON.stringify({ intent: "CLARIFY", items: [] }))(text, context);
  expect(result).toMatchObject({ aiAvailable: true, intent: "CLARIFY", proposals: [], unsupportedReason: expect.stringContaining("won't assume you stop driving") });
});

it("does not collapse two distinct future births just because the model reused a broad quote", () => {
  const quote = "I'm expecting my second child in 2029 and one additional child in 2030";
  const mapped = mapExtraction({ intent: "CREATE_SCENARIO", items: [
    { field: "children", value: 2, quote, month: "in 2029", certainty: "inferred", assumptions: [] },
    { field: "childrenDelta", value: 1, quote, month: "in 2030", certainty: "inferred", assumptions: [] },
  ] }, context, quote);
  expect(mapped.result.aiAvailable && mapped.result.proposals.map(event => [event.month, event.payload])).toEqual([[32, { children: 2 }], [44, { childrenDelta: 1 }]]);
});

it.each(["My commute is 30 miles from home", "My commute is 30 miles from work", "I drive 30 miles to work"])("supports a contextual commute distance: %s", text => {
  const read = interpretOffline(text, todayISO);
  expect(read.events[0]).toMatchObject({ type: "mileage_change", payload: { commuteMilesOneWay: 30 }, certainty: "inferred" });
  expect(read.events[0].assumptions.join(" ")).toContain("one way");
});
