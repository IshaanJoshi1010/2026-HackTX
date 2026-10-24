import { describe, expect, it, vi } from "vitest";
import { ExtractionSchema } from "./schema";
import { mapExtraction } from "./mapper";
import { resolveEventMonth } from "./dates";
import { testDumps } from "./testDumps";
import { createFixtureExtractor, runExtractionCases } from "./testHarness";
import { InterpretResultSchema } from "../contracts/schemas";
import type { InterpretContext } from "../contracts";
const ctx: InterpretContext = { vehicle: { make: "Toyota", model: "Camry", year: 2022, trim: "SE" },
  profile: { children: 0, annualMiles: 12000 }, existingEvents: [], todayISO: "2026-10-24" };
const testItem = (value: number, month?: string, quote = `I drive ${value} miles`) => ({ field: "annualMiles", value, quote, certainty: "clear", assumptions: [], ...(month ? { month } : {}) });

describe("C8a 20-case offline extraction contract", () => {
  it("evaluates the fake extractor and detects changed, malformed, and failed extraction", async () => {
    expect(testDumps).toHaveLength(20);
    expect(new Set(testDumps.map(test => test.id)).size).toBe(20);
    expect((await runExtractionCases(createFixtureExtractor())).every(r => r.passed)).toBe(true);
    const wrong = await runExtractionCases(() => ({ intent: "CLARIFY", items: [] }), [testDumps[0]]);
    expect(wrong[0].passed).toBe(false);
    expect(wrong[0].actual).toBeDefined();
    expect((await runExtractionCases(() => ({ code: "run this" }), [testDumps[0]]))[0].passed).toBe(false);
    expect((await runExtractionCases(() => { throw new Error("offline"); }, [testDumps[0]]))[0].error).toBe("offline");
  });
  it.each(testDumps)("maps $id into the expected proposed events and patch fields", test => {
    const mapped = mapExtraction(test.expected, ctx, test.prompt);
    expect(InterpretResultSchema.safeParse(mapped.result).success).toBe(true);
    if (!mapped.result.aiAvailable) throw new Error("Expected mapped output");
    expect(mapped.result.proposals.map(({ type, month, payload, certainty }) => ({ type, month, payload, certainty }))).toEqual(test.events);
    expect(mapped.result.profilePatches.map(patch => patch.field)).toEqual(test.patchFields);
    expect(mapped.unresolved).toHaveLength(test.unresolved);
    expect(mapped.result.proposals.every(event => event.status === "proposed" && event.source === "ai")).toBe(true);
    expect(mapExtraction(test.expected, ctx, test.prompt)).toEqual(mapped);
  });
});

describe("pure date handling", () => {
  it.each([["next year", 12], ["next month", 1], ["in 2 years", 24], ["in 6 months", 6], ["now", 0], ["in 2029", 32]])("resolves %s with code", (phrase, month) => {
    expect(resolveEventMonth(String(phrase), ctx.todayISO)).toMatchObject({ resolved: true, month });
  });
  it("uses supplied today, flags June inference, and does not invent vague or past dates", () => {
    expect(resolveEventMonth("2029", "2027-01-01")).toMatchObject({ resolved: true, month: 29, inferred: true });
    expect(resolveEventMonth("2026", ctx.todayISO).resolved).toBe(false);
    expect(resolveEventMonth("in a couple years", ctx.todayISO).resolved).toBe(false);
    expect(resolveEventMonth("in -2 months", ctx.todayISO).resolved).toBe(false);
    expect(resolveEventMonth(undefined, ctx.todayISO, true)).toMatchObject({ resolved: true, month: 9, inferred: true });
    expect(() => resolveEventMonth("next year", "not-a-date")).toThrow();
    expect(() => resolveEventMonth("next year", "2026-02-30")).toThrow();
  });
});

describe("proposal safeguards", () => {
  it("rejects unknown output keys, unsupported-with-items, ungrounded quotes and invented numeric values", () => {
    expect(ExtractionSchema.safeParse({ intent: "CLARIFY", items: [], javascript: "run" }).success).toBe(false);
    expect(ExtractionSchema.safeParse({ intent: "CLARIFY", items: [testItem(12000)], unsupported: "diagnosis" }).success).toBe(false);
    expect(ExtractionSchema.safeParse({ intent: "CREATE_SCENARIO", items: [{ ...testItem(12000), certainty: "vague" }] }).success).toBe(false);
    const ungrounded = mapExtraction({ intent: "CREATE_SCENARIO", items: [testItem(12000)] }, ctx, "hello");
    expect(ungrounded.unresolved).toHaveLength(1);
    const invented = mapExtraction({ intent: "CREATE_SCENARIO", items: [{ ...testItem(99999), quote: "I drive 12k miles" }] }, ctx, "I drive 12k miles");
    expect(invented.unresolved).toHaveLength(1);
    const date = mapExtraction({ intent: "CREATE_SCENARIO", items: [testItem(12000, "next year")] }, ctx, "I drive 12000 miles");
    expect(date.unresolved).toHaveLength(1);
  });
  it("withholds conflicting values even when raw timing phrases resolve to the same month", () => {
    const first = testItem(12000, "next year", "12000 miles next year");
    const second = testItem(20000, "in 12 months", "20000 miles in 12 months");
    const mapped = mapExtraction({ intent: "CREATE_SCENARIO", items: [first, second] }, ctx, `${first.quote}; ${second.quote}`);
    expect(mapped.unresolved).toHaveLength(2);
    expect(mapped.result.aiAvailable && mapped.result.proposals).toEqual([]);
  });
  it("never patches future values and groups simultaneous family fields using the sim payload keys", () => {
    const prompt = "wife's pregnant; household will be 3 in 9 months";
    const mapped = mapExtraction({ intent: "CREATE_SCENARIO", items: [
      { field: "childrenDelta", value: 1, certainty: "inferred", quote: "wife's pregnant", assumptions: [] },
      { field: "householdSize", value: 3, certainty: "clear", quote: "household will be 3 in 9 months", month: "in 9 months", assumptions: [] },
    ] }, ctx, prompt);
    if (!mapped.result.aiAvailable) throw new Error("Expected mapped output");
    expect(mapped.result.profilePatches).toEqual([]);
    expect(mapped.result.proposals).toHaveLength(1);
    expect(mapped.result.proposals[0].payload).toEqual({ childrenDelta: 1, householdSize: 3 });
    expect(mapped.result.proposals[0].certainty).toBe("inferred");
  });
  it("does not infer pregnancy from a negated mention or invent vehicle trim/year from a model name", () => {
    const prompt = "wife isn't pregnant";
    const pregnancy = mapExtraction({ intent: "CREATE_SCENARIO", items: [{ field: "childrenDelta", value: 1, certainty: "inferred", quote: prompt, assumptions: [] }] }, ctx, prompt);
    expect(pregnancy.unresolved).toHaveLength(1);
    const vehicle = mapExtraction({ intent: "CREATE_SCENARIO", items: [{ field: "vehicleId", value: "RAV4", certainty: "clear", quote: "Switch to RAV4", assumptions: [] }] }, ctx, "Switch to RAV4");
    expect(vehicle.unresolved).toHaveLength(1);
  });
  it("does not create changes from read-only intents even if extra items are supplied", () => {
    const result = mapExtraction({ intent: "EXPLAIN_RESULT", items: [testItem(12000)] }, ctx, "I drive 12000 miles");
    expect(result.result.aiAvailable && result.result.proposals).toEqual([]);
    expect(result.result.aiAvailable && result.result.profilePatches).toEqual([]);
  });
  it("never mutates context or calls the network and preserves one uncertainty question", () => {
    const before = structuredClone(ctx), fetch = vi.fn(() => { throw new Error("Network disabled"); });
    vi.stubGlobal("fetch", fetch);
    try {
      const test = testDumps.find(test => test.id === "contradiction")!;
      const result = mapExtraction(test.expected, ctx, test.prompt);
      expect(ctx).toEqual(before);
      expect(result.result.aiAvailable && result.result.question?.options).toContain("I'm not sure");
      expect(fetch).not.toHaveBeenCalled();
      expect(ExtractionSchema.safeParse({ ...test.expected, clarifyingQuestion: { field: "annualMiles", question: "How much?", options: ["15000"] } }).success).toBe(false);
    } finally { vi.unstubAllGlobals(); }
  });
});
