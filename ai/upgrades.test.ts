import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { interpretOffline } from "./offline";
import { resolveEventMonth } from "./dates";
import { mapExtraction } from "./mapper";
import { prepareManualEvent, prepareScenarioTerms } from "./scenarioDraft";
import { createServiceGate } from "./serviceGate";
import { readJsonBody, requestError } from "../app/api/requestBody";
import { POST as interpretRoute } from "../app/api/interpret/route";
import { POST as explainRoute } from "../app/api/explain/route";
import { demoBrainDump, demoTodayISO } from "../data/demo";
import type { InterpretContext } from "../contracts";
const ctx: InterpretContext = { vehicle: { make: "Toyota", model: "Camry", year: 2022, trim: "SE" }, profile: {}, existingEvents: [], todayISO: demoTodayISO };

describe("offline input correctness", () => {
  it.each(["I'm not pregnant.", "I don't plan to move to Denver next year.", "If I move to Denver next year", "Maybe I will have another child.", "Actually I drive 15000 miles per year, not 20000."])("does not turn uncertain or negated statements into changes: %s", prompt => {
    expect(interpretOffline(prompt, demoTodayISO).events).toEqual([]);
  });
  it.each(["Should I move to Denver next year?", "What if I drive 20000 miles per year?", "Would switching to a RAV4 while driving 20000 miles a year make sense?"])("keeps questions read only: %s", prompt => {
    expect(interpretOffline(prompt, demoTodayISO).events).toEqual([]);
  });
  it("preserves comparison and threshold query intents", () => {
    expect(interpretOffline("Would switching to a RAV4 make sense?", demoTodayISO).intent).toBe("COMPARE_SCENARIOS");
    expect(interpretOffline("What would make keeping the Camry better?", demoTodayISO).intent).toBe("FIND_BREAK_EVEN");
  });
  it("never confuses odometer, commute and annual miles", () => {
    expect(interpretOffline("My car has 48,000 miles on it.", demoTodayISO).events).toEqual([]);
    const commute = interpretOffline("My commute is 25 miles each way, six days per week.", demoTodayISO);
    expect(commute.events).toHaveLength(1);
    expect(commute.events[0].payload).toEqual({ commuteMilesOneWay: 25, commuteDaysPerWeek: 6 });
    expect(interpretOffline("I drive 500 miles per year.", demoTodayISO).events[0].payload).toEqual({ annualMiles: 500 });
  });
  it.each(["I'm moving to Denver in 10 years.", "I'm moving to Denver next summer.", "I'm moving to Denver after my lease ends."])("does not clamp or erase unsupported timing: %s", prompt => {
    const result = interpretOffline(prompt, demoTodayISO);
    expect(result.events).toEqual([]); expect(result.note).toBeTruthy();
  });
  it("still supports the offline demo with distinct date ownership", () => {
    const events = interpretOffline(demoBrainDump, demoTodayISO).events;
    expect(events.map(({ type, month, payload }) => ({ type, month, payload }))).toEqual([
      { type: "relocation", month: 12, payload: { location: "Denver" } },
      { type: "mileage_change", month: 0, payload: { annualMiles: 20000 } },
      { type: "family_change", month: 32, payload: { children: 2 } },
    ]);
    expect(events.every(e => e.source === "user")).toBe(true);
  });
  it("handles zero children, a budget and decimal fuel without inventing household size", () => {
    expect(interpretOffline("We have zero children.", demoTodayISO).events[0].payload).toEqual({ children: 0 });
    expect(interpretOffline("Budget is $500/month.", demoTodayISO).events[0].payload).toEqual({ monthlyBudget: 500 });
    expect(interpretOffline("Gas is $3.50 per gallon.", demoTodayISO).events[0].payload).toEqual({ fuelPricePerGal: 3.5 });
  });
});

describe("quantity meaning and date grounding", () => {
  function map(field: string, value: number | string, prompt: string, quote = prompt) {
    return mapExtraction({ intent: "CREATE_SCENARIO", items: [{ field, value, quote, certainty: "clear", assumptions: [] }] }, ctx, prompt);
  }
  it.each([
    ["annualMiles", 500, "My budget is $500 per month and I drive 12000 miles per year."],
    ["monthlyBudget", 12000, "My budget is $500 per month and I drive 12000 miles per year."],
    ["annualMiles", 48000, "My car has 48000 miles on it."],
    ["annualMiles", 48000, "I drive a car with 48000 miles."],
    ["carSeats", 3, "The vehicle has 3 seats."],
    ["children", 2029, "We expect our second child in 2029."],
    ["fuelPricePerGal", 500, "Budget is $500; fuel is $3.50 per gallon."],
  ])("rejects a number assigned to the wrong field: %s", (field, value, prompt) => {
    expect(map(String(field), value, String(prompt)).unresolved).toHaveLength(1);
  });
  it("accepts the correctly associated number and spelled out counts", () => {
    expect(map("annualMiles", 12000, "My budget is $500 per month and I drive 12000 miles per year.").unresolved).toEqual([]);
    expect(map("commuteDaysPerWeek", 6, "I commute six days per week.").unresolved).toEqual([]);
    expect(map("children", 5, "We have five children.").unresolved).toEqual([]);
  });
  it("does not confuse a four-digit driving quantity or budget with a calendar year", () => {
    expect(map("annualMiles", 2029, "I drive 2029 miles per year.").unresolved).toEqual([]);
    expect(map("monthlyBudget", 2029, "My budget is $2029 per month.").unresolved).toEqual([]);
  });
  it("accepts a stated May calendar date rather than confusing it with a hypothetical", () => {
    const quote = "I am moving to Denver in May 2027";
    const result = mapExtraction({ intent: "CREATE_SCENARIO", items: [{ field: "location", value: "Denver", certainty: "clear", quote, month: "in May 2027", assumptions: [] }] }, ctx, quote);
    expect(result.unresolved).toEqual([]);
    expect(result.result.aiAvailable && result.result.proposals[0].month).toBe(7);
  });
  it("rejects a negation even when the model quotes only a positive-looking fragment", () => {
    expect(map("location", "Denver", "I am not moving to Denver.", "Denver").unresolved).toHaveLength(1);
  });
  it.each(["next summer", "in six months", "March 2027", "after my lease ends"])("rejects omitted timing: %s", phrase => {
    expect(map("location", "Denver", `I am moving to Denver ${phrase}.`).unresolved).toHaveLength(1);
  });
  it.each([["in six months", 6], ["in two years", 24], ["March 2027", 5], ["this December", 2], ["next March", 5], ["2027-03-15", 5]])("resolves %s deterministically", (phrase, month) => {
    expect(resolveEventMonth(String(phrase), demoTodayISO)).toMatchObject({ resolved: true, month });
  });
  it("does not invent a seasonal date, next occurrence of an unspecified month, or clamp ten years", () => {
    expect(resolveEventMonth("next summer", demoTodayISO).resolved).toBe(false);
    expect(resolveEventMonth("March", demoTodayISO).resolved).toBe(false);
    expect(resolveEventMonth("in ten years", demoTodayISO)).toMatchObject({ resolved: true, month: 120 });
  });
});

describe("manual scenario drafts", () => {
  it("converts entered percentages once, preserves zero values and never modifies the input", () => {
    const input = { insurancePerMonth: 0, replacementPrice: 30000, downPayment: 5000, purchaseFees: 0, salesTaxPercent: 6.25, newLoanAprPercent: 6.5, newLoanTermMonths: 60, loanAprPercent: 0 };
    const before = structuredClone(input), draft = prepareScenarioTerms(input);
    expect(input).toEqual(before);
    expect(draft).toMatchObject({ ok: true, status: "proposed", assumptions: { insurancePerMonth: 0, replacementPrice: 30000, downPayment: 5000, purchaseFees: 0, salesTaxRate: 0.0625, newLoanApr: 0.065, newLoanTermMonths: 60, loanApr: 0 } });
    expect(draft.ok && Object.values(draft.provenance).every(s => s === "user")).toBe(true);
    expect(prepareScenarioTerms({})).toMatchObject({ ok: true, assumptions: {}, provenance: {} });
  });
  it.each([{ replacementPrice: 100, downPayment: 101 }, { newLoanTermMonths: 0 }, { newLoanAprPercent: 101 }, { insurancePerMonth: -1 }, { insurancePerMonth: Infinity }, { newLoanApr: 0.06 }])("rejects invalid finance terms", input => {
    expect(prepareScenarioTerms(input).ok).toBe(false);
  });
  it.each([{ type: "family_change", month: 0, children: 0 }, { type: "mileage_change", month: 0, annualMiles: 0 }, { type: "mileage_change", month: 60, annualMiles: 500 }, { type: "budget_change", month: 3, monthlyBudget: 500 }])("accepts supported manual values as proposals", input => {
    expect(prepareManualEvent(input)).toMatchObject({ ok: true, event: { status: "proposed", source: "user", month: input.month } });
  });
  it("does not infer household size or alter zero month", () => {
    expect(prepareManualEvent({ type: "family_change", month: 0, children: 0 })).toMatchObject({ event: { payload: { children: 0 }, month: 0 } });
    expect(prepareManualEvent({ type: "family_change", month: 61, children: 0 }).ok).toBe(false);
    expect(prepareManualEvent({ type: "family_change", month: 0, children: -1 }).ok).toBe(false);
  });
});

describe("service recovery and request limits", () => {
  it("limits concurrency and allows recovery without sleeping", () => {
    let time = 0; const gate = createServiceGate(() => time);
    const a = gate.acquire(), b = gate.acquire();
    expect(a.ok && b.ok).toBe(true); expect(gate.acquire()).toEqual({ ok: false, retryAfter: 1 });
    if (a.ok) { a.release(); a.release(); }
    gate.failure(503); expect(gate.acquire()).toEqual({ ok: false, retryAfter: 8 });
    time = 8000; expect(gate.acquire().ok).toBe(true);
  });
  it("limits aggregate generation and cools down on provider quota errors", () => {
    let time = 0; const gate = createServiceGate(() => time);
    for (let i = 0; i < 10; i++) { const permit = gate.acquire(); expect(permit.ok).toBe(true); if (permit.ok) permit.release(); }
    expect(gate.acquire()).toEqual({ ok: false, retryAfter: 60 });
    time = 60000; const permit = gate.acquire(); expect(permit.ok).toBe(true); if (permit.ok) permit.release();
    gate.failure(429); expect(gate.acquire()).toEqual({ ok: false, retryAfter: 60 });
    time = 120000; expect(gate.acquire().ok).toBe(true);
  });
  it("rejects oversized chunked and declared bodies, and accepts UTF-8 JSON", async () => {
    await expect(readJsonBody(new Request("http://localhost", { method: "POST", body: '"éé"' }), 5)).rejects.toMatchObject({ status: 413 });
    await expect(readJsonBody(new Request("http://localhost", { method: "POST", body: "{}", headers: { "content-length": "100" } }), 10)).rejects.toMatchObject({ status: 413 });
    expect(await readJsonBody(new Request("http://localhost", { method: "POST", body: '{"city":"Montréal"}' }), 100)).toEqual({ city: "Montréal" });
  });
  it("rejects an already cancelled request without processing it", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(readJsonBody(new Request("http://localhost", { method: "POST", body: "{}", signal: controller.signal }), 100)).rejects.toMatchObject({ status: 499 });
  });
  it("cancels a stalled body read when the caller disconnects", async () => {
    const controller = new AbortController(), cancelled = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel: cancelled });
    const request = new Request("http://localhost", { method: "POST", body: stream, signal: controller.signal, duplex: "half" } as RequestInit);
    const pending = readJsonBody(request, 100);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ status: 499 });
    expect(cancelled).toHaveBeenCalledOnce();
  });
  it("distinguishes unexpected server failures from malformed user input without leaking details", async () => {
    const response = requestError(new Error("private provider data"), "Invalid request");
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Unable to process request" });
    expect(requestError(new SyntaxError("bad json"), "Invalid request").status).toBe(400);
  });
  it.each([interpretRoute, explainRoute])("returns a clear 413 before any AI request", async route => {
    const response = await route(new Request("http://localhost/api", { method: "POST", body: "x", headers: { "content-length": "9999999" } }));
    expect(response.status).toBe(413);
  });
});
