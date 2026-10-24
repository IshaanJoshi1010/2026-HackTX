import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const sdk = vi.hoisted(() => ({ generateContent: vi.fn(), constructor: vi.fn() }));
vi.mock("@google/genai", () => ({ GoogleGenAI: class {
  models = { generateContent: sdk.generateContent };
  constructor(options: unknown) { sdk.constructor(options); }
} }));
import { createInterpreter, interpret } from "./interpret";
import * as interpreterModule from "./interpret";
import { createExplainer } from "./explain";
import * as explainerModule from "./explain";
import { generateWithGemini } from "./gemini";
import { numberCheck } from "./numberCheck";
import { prepareManualDraft, ManualProfileSchema, manualFields } from "./manualForms";
import { returnVisitQuestion } from "./returnVisit";
import { testDumps } from "./testDumps";
import { InterpretResultSchema, DriverProfileSchema } from "../contracts/schemas";
import { alexProfile } from "../data/fixtures/alex";
import type { DecisionEvaluation, InterpretContext, SimulationResult } from "../contracts";
import { POST as interpretRoute } from "../app/api/interpret/route";
import { POST as explainRoute } from "../app/api/explain/route";

const context: InterpretContext = { vehicle: { make: "Toyota", model: "Camry", year: 2022, trim: "SE" }, profile: { ...alexProfile, location: "PRIVATE LOCATION" }, existingEvents: [], todayISO: "2026-10-24" };
const evaluation: DecisionEvaluation = { scenarioIds: ["keep"], hardConstraints: [], preferredScenarioId: "keep", rationale: [], sensitivity: [], nextAction: { label: "Review comparison", detail: "Verify assumptions" } };
const results: SimulationResult[] = [{ scenarioId: "keep", points: [], milestones: [], warnings: [], summary: { totalCash: 12000, netCost: 15000 } }];
beforeEach(() => { sdk.generateContent.mockReset(); sdk.constructor.mockReset(); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("Gemini transport configuration", () => {
  it("does not call the SDK without a key, and uses server-side key/model and timeout when configured", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(await interpret("I drive 12000 miles", context)).toEqual({ aiAvailable: false });
    expect(sdk.constructor).not.toHaveBeenCalled();
    vi.stubEnv("GEMINI_API_KEY", "test-only-not-a-credential");
    vi.stubEnv("GEMINI_MODEL", "test-model");
    sdk.generateContent.mockResolvedValue({ text: "hello" });
    expect(await generateWithGemini({ system: "rules", input: { value: 1 }, schema: { type: "object" } })).toBe("hello");
    expect(sdk.constructor).toHaveBeenCalledWith(expect.objectContaining({ httpOptions: { timeout: 15000, retryOptions: { attempts: 1 } } }));
    expect(sdk.generateContent.mock.calls[0][0]).toMatchObject({ model: "test-model", config: { systemInstruction: "rules", responseMimeType: "application/json" } });
    expect(sdk.generateContent.mock.calls[0][0].config.tools).toBeUndefined();
  });
});

describe("C8b interpretation pipeline with mocked Gemini", () => {
  it.each(testDumps)("runs the authored $id dump through a mocked generation function", async test => {
    const generate = vi.fn().mockResolvedValue(JSON.stringify(test.expected));
    const result = await createInterpreter(generate)(test.prompt, context);
    expect(InterpretResultSchema.safeParse(result).success).toBe(true);
    if (!result.aiAvailable) throw new Error("Expected mocked AI output");
    expect(result.proposals.map(({ type, month, payload, certainty }) => ({ type, month, payload, certainty }))).toEqual(test.events);
    expect(result.proposals.every(event => event.status === "proposed")).toBe(true);
    if (test.expected.unsupported) {
      expect(result.unsupportedReason).toContain("cannot diagnose");
      expect(result.profilePatches).toEqual([]);
    }
    if (result.question) expect(result.question.options).toContain("I'm not sure");
  });
  it("retries malformed JSON/schema once, then clarifies; a network failure uses manual mode", async () => {
    const generate = vi.fn().mockResolvedValue("not json");
    const result = await createInterpreter(generate)("hi", context);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ aiAvailable: true, intent: "CLARIFY", proposals: [], profilePatches: [] });
    const firstBad = vi.fn().mockResolvedValueOnce("garbage").mockResolvedValueOnce(JSON.stringify(testDumps[8].expected));
    const repaired = await createInterpreter(firstBad)(testDumps[8].prompt, context);
    expect(repaired.aiAvailable && repaired.proposals[0].payload.annualMiles).toBe(20000);
    const network = vi.fn().mockRejectedValue(new Error("private network error"));
    expect(await createInterpreter(network)("hi", context)).toEqual({ aiAvailable: false });
    expect(network).toHaveBeenCalledTimes(1);
  });
  it("sends minimal relevant context and leaves confirmed inputs unchanged", async () => {
    const before = structuredClone(context);
    const generate = vi.fn().mockResolvedValue(JSON.stringify(testDumps[7].expected));
    await createInterpreter(generate)("hi", context);
    const input = generate.mock.calls[0][0].input;
    expect(input.context.vehicle).toEqual({ model: "Camry", year: 2022 });
    expect(input.context.profile.location).toBeUndefined();
    expect(input.context.profile.provenance).toBeUndefined();
    expect(input.context.profile).toEqual({});
    expect(JSON.stringify(input)).not.toContain("PRIVATE LOCATION");
    expect(context).toEqual(before);
  });
  it("asks only one impact-gated question and drops irrelevant model questions", async () => {
    const contradiction = testDumps[1];
    const asked = await createInterpreter(async () => JSON.stringify(contradiction.expected))(contradiction.prompt, context);
    expect(asked.aiAvailable && asked.question?.field).toBe("annualMiles");
    const irrelevant = { intent: "CLARIFY", items: [], clarifyingQuestion: { field: "location", question: "What is your address?", options: ["Enter", "I'm not sure"] } };
    const ignored = await createInterpreter(async () => JSON.stringify(irrelevant))("hi", context);
    expect(ignored.aiAvailable && ignored.question).toBeUndefined();
  });
  it("three phrasings of the demo produce equivalent event payloads", async () => {
    const variants = [
      { prompt: testDumps[0].prompt, expected: testDumps[0].expected },
      { prompt: "Move to Denver next year; 20,000 annual miles; second child in 2029.", expected: { intent: "CREATE_SCENARIO", items: [
        { field: "location", value: "Denver", certainty: "clear", quote: "Move to Denver next year", month: "next year", assumptions: [] },
        { field: "annualMiles", value: 20000, certainty: "clear", quote: "20,000 annual miles", assumptions: [] },
        { field: "children", value: 2, certainty: "clear", quote: "second child in 2029", month: "in 2029", assumptions: [] },
      ] } },
      { prompt: "next year I'm moving to Denver. Driving 20k mi/yr. In 2029 we expect our second child.", expected: { intent: "CREATE_SCENARIO", items: [
        { field: "location", value: "Denver", certainty: "clear", quote: "next year I'm moving to Denver", month: "next year", assumptions: [] },
        { field: "annualMiles", value: 20000, certainty: "clear", quote: "Driving 20k mi/yr", assumptions: [] },
        { field: "children", value: 2, certainty: "clear", quote: "In 2029 we expect our second child", month: "In 2029", assumptions: [] },
      ] } },
    ];
    const output = [];
    for (const variant of variants) {
      const result = await createInterpreter(async () => JSON.stringify(variant.expected))(variant.prompt, context);
      if (!result.aiAvailable) throw new Error("Expected mock result");
      output.push(result.proposals.map(({ type, month, payload }) => ({ type, month, payload })));
    }
    expect(output[1]).toEqual(output[0]); expect(output[2]).toEqual(output[0]);
  });
});

describe("explanation number guard and fallback", () => {
  it("permits supplied formatting and sequential list indexes, but rejects new numbers", () => {
    expect(numberCheck("Cost is $12,000", { cost: 12000 }).ok).toBe(true);
    expect(numberCheck("Cost is 12k", { cost: 12000 }).ok).toBe(true);
    expect(numberCheck("1. Review costs\n2. Check fit", {}).ok).toBe(true);
    expect(numberCheck("99. Review costs", {}).ok).toBe(false);
    expect(numberCheck("Cost is 99999", { cost: 12000 }).ok).toBe(false);
    expect(numberCheck("You save ninety dollars", { cost: 12000 }).ok).toBe(false);
    expect(numberCheck("Cost is twelve thousand", { cost: 12000 }).ok).toBe(true);
    expect(numberCheck("10% savings", { rate: 0.1 }).ok).toBe(false);
    expect(numberCheck("minus ninety dollars", { value: 90 }).ok).toBe(false);
    expect(numberCheck("third scenario", { value: 1 }).ok).toBe(false);
    expect(numberCheck("one point five", { values: [1, 5] }).ok).toBe(false);
    expect(numberCheck("123abc", { value: 12 }).ok).toBe(false);
  });
  it("uses model prose only if numbers match; invented numbers and outages use a deterministic explanation", async () => {
    const safe = await createExplainer(async () => "Computed cost is $12,000.")(evaluation, results);
    expect(safe.usedFallback).toBe(false);
    const invented = await createExplainer(async () => "You will save $99999.")(evaluation, results);
    expect(invented.usedFallback).toBe(true);
    expect(invented.text).not.toContain("99999");
    expect((await createExplainer(async () => { throw new Error("offline"); })(evaluation, results)).usedFallback).toBe(true);
    const inconclusive = await createExplainer(async () => "invented 42")({ ...evaluation, preferredScenarioId: "inconclusive" }, results);
    expect(inconclusive.text).toContain("do not establish a clear");
  });
});

describe("manual path, return visit and route handlers", () => {
  it("supports skipping optional manual fields with no key", () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const result = prepareManualDraft({});
    if (!result.ok) throw new Error(result.error);
    expect(DriverProfileSchema.safeParse(result.profile).success).toBe(true);
    expect(ManualProfileSchema.safeParse({ children: -1 }).success).toBe(false);
    const manual = prepareManualDraft({ mileage: 12345, tradeoffPicks: [{ pairId: "cost_vs_cargo", choice: "A" }] });
    expect(manual.ok && manual.mileage).toBe(12345);
    expect(manual.ok && manual.profile.priorities.cost).toBe(0.3);
    expect(manualFields.filter(field => field.kind === "chips").every(field => field.options.includes("I'm not sure"))).toBe(true);
    expect(returnVisitQuestion({ ...alexProfile, commuteDaysPerWeek: 4 })).toMatchObject({ text: "Still commuting 4 days a week?", options: ["Yes", "Update"] });
  });
  it("validates interpret requests and returns the result without secrets", async () => {
    vi.spyOn(interpreterModule, "interpret").mockResolvedValue({ aiAvailable: false });
    const good = await interpretRoute(new Request("http://localhost/api/interpret", { method: "POST", body: JSON.stringify({ prompt: "hi", context }) }));
    expect(good.status).toBe(200); expect(await good.json()).toEqual({ aiAvailable: false });
    const bad = await interpretRoute(new Request("http://localhost/api/interpret", { method: "POST", body: "not JSON" }));
    expect(bad.status).toBe(400);
  });
  it("validates explain requests and returns deterministic fallback data", async () => {
    vi.spyOn(explainerModule, "explain").mockResolvedValue({ text: "Review comparison.", usedFallback: true });
    const good = await explainRoute(new Request("http://localhost/api/explain", { method: "POST", body: JSON.stringify({ evaluation, results }) }));
    expect(good.status).toBe(200); expect(await good.json()).toEqual({ text: "Review comparison.", usedFallback: true });
    const bad = await explainRoute(new Request("http://localhost/api/explain", { method: "POST", body: JSON.stringify({ evaluation: {} }) }));
    expect(bad.status).toBe(400);
  });
});
