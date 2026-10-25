// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createInterpreter } from "./interpret";
import { createExplainer } from "./explain";
import { createServiceGate } from "./serviceGate";
import { EXPLAIN_BUDGET_MS, INTERPRET_BUDGET_MS } from "./generationBudget";
import type { GenerationRequest } from "./gemini";
import { interpretOffline } from "./offline";
import story from "./fixtures/dev4-demo-story.json";
import { DecisionEvaluationSchema, SimulationResultSchema } from "../contracts/schemas";
const ctx = { vehicle: { make: "Toyota", model: "Camry", year: 2022, trim: "SE" }, profile: {}, existingEvents: [], todayISO: "2026-10-24" };
const prompt = "I drive 8,000 miles a year.";
const evaluation = DecisionEvaluationSchema.parse(story.evaluation);
const results = story.results.map(r => SimulationResultSchema.parse(r));
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("request deadlines and local cancellation", () => {
  it("returns offline recovery before the website's 15-second deadline even if the provider never resolves", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const generate = vi.fn((request: GenerationRequest) => { signal = request.signal; return new Promise<string>(() => {}); });
    const pending = createInterpreter(generate)(prompt, ctx);
    await vi.advanceTimersByTimeAsync(INTERPRET_BUDGET_MS);
    expect(await pending).toEqual({ aiAvailable: false });
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("shares one total deadline across the validation retry rather than restarting the clock", async () => {
    vi.useFakeTimers();
    const generate = vi.fn().mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve("invalid JSON"), 8000)))
      .mockImplementationOnce(() => new Promise<string>(() => {}));
    const pending = createInterpreter(generate)(prompt, ctx);
    await vi.advanceTimersByTimeAsync(8000);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0].timeoutMs).toBe(INTERPRET_BUDGET_MS - 8000);
    await vi.advanceTimersByTimeAsync(INTERPRET_BUDGET_MS - 8000);
    expect(await pending).toEqual({ aiAvailable: false });
  });
  it("stops local generation when the HTTP caller disconnects", async () => {
    const controller = new AbortController();
    let providerSignal: AbortSignal | undefined;
    const generate = vi.fn((request: GenerationRequest) => { providerSignal = request.signal; return new Promise<string>(() => {}); });
    const pending = createInterpreter(generate)(prompt, ctx, { signal: controller.signal });
    await Promise.resolve();
    controller.abort();
    expect(await pending).toEqual({ aiAvailable: false });
    expect(providerSignal?.aborted).toBe(true);
  });
  it("never starts a provider request for an already aborted call", async () => {
    const controller = new AbortController(); controller.abort();
    const generate = vi.fn();
    expect(await createInterpreter(generate)(prompt, ctx, { signal: controller.signal })).toEqual({ aiAvailable: false });
    expect(generate).not.toHaveBeenCalled();
  });
  it("returns a computed explanation when a provider hangs, retaining the exact engine verdict", async () => {
    vi.useFakeTimers();
    const pending = createExplainer(() => new Promise<string>(() => {}))(evaluation, results);
    await vi.advanceTimersByTimeAsync(EXPLAIN_BUDGET_MS);
    const actual = await pending;
    expect(actual.usedFallback).toBe(true);
    expect(actual.text).toContain(evaluation.rationale[0]);
    expect(actual.text).toContain(evaluation.nextAction.detail);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("website recovery without bypassing confirmation or grounding", () => {
  it.each(["I drive 8,000 miles a year.", "im going to drive 100 miles a day next year in denver"])("lets the shared offline reader handle an empty AI answer: %s", async text => {
    const before = structuredClone(ctx);
    expect(await createInterpreter(async () => JSON.stringify({ intent: "CLARIFY", items: [] }))(text, ctx)).toEqual({ aiAvailable: false });
    expect(interpretOffline(text, ctx.todayISO).events.length).toBeGreaterThan(0);
    expect(ctx).toEqual(before);
  });
  it("recovers after malformed output only when the supported clauses were fully covered", async () => {
    expect(await createInterpreter(async () => "broken JSON")(prompt, ctx)).toEqual({ aiAvailable: false });
    const partial = "I drive 8000 miles a year and my household is four.";
    expect(await createInterpreter(async () => "broken JSON")(partial, ctx)).toMatchObject({ aiAvailable: true, intent: "CLARIFY", proposals: [] });
  });
  it.each(["Maybe I will drive 8000 miles a year.", "I won't drive 8000 miles a year.", "My annual mileage is 8000 and my loan payment is $450."])("does not turn an invalid answer into a partial or contradicted plan: %s", async text => {
    expect(await createInterpreter(async () => "broken JSON")(text, ctx)).toMatchObject({ aiAvailable: true, intent: "CLARIFY", proposals: [] });
  });
  it("does not silently discard a date after a comma", () => {
    expect(interpretOffline("I am moving to Denver, Colorado next year.", ctx.todayISO).events).toEqual([]);
  });
});

describe("typed-input capacity survives background explanations", () => {
  it("allows only one background explanation, keeping a concurrent slot available for interpretation", () => {
    const gate = createServiceGate(() => 0);
    const explanation = gate.acquire("explain");
    expect(explanation.ok).toBe(true);
    expect(gate.acquire("explain").ok).toBe(false);
    const interpretation = gate.acquire("interpret");
    expect(interpretation.ok).toBe(true);
    expect(gate.acquire("interpret").ok).toBe(false);
    if (explanation.ok) { explanation.release(); explanation.release(); }
    expect(gate.acquire("interpret").ok).toBe(true);
  });
  it("reserves rolling-window starts for user prompts without exceeding the shared quota", () => {
    const gate = createServiceGate(() => 0);
    for (let i = 0; i < 4; i++) { const p = gate.acquire("explain"); expect(p.ok).toBe(true); if (p.ok) p.release(); }
    expect(gate.acquire("explain")).toEqual({ ok: false, retryAfter: 60 });
    for (let i = 0; i < 16; i++) { const p = gate.acquire("interpret"); expect(p.ok).toBe(true); if (p.ok) p.release(); }
    expect(gate.acquire("interpret")).toEqual({ ok: false, retryAfter: 60 });
  });
});
