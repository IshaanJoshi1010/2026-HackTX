import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import captures from "./fixtures/live-extraction-failures.json";
import { createInterpreter } from "./interpret";
import { interpretOffline } from "./offline";
import { mapExtraction } from "./mapper";
import { testDumps } from "./testDumps";
import { alexProfile } from "../data/fixtures/alex";

const context = { vehicle: { make: "Toyota", model: "Camry", year: 2022, trim: "SE" }, profile: alexProfile, existingEvents: [], todayISO: "2026-10-24" };
const captured = (id: string) => captures.cases.find(c => c.id === id)!.responses[0];
const authored = (id: string) => testDumps.find(c => c.id === id)!;

describe("captured live extraction failure regressions", () => {
  it("constrains generation quotes to exact source text, preserving dates before an event", async () => {
    const prompt = "next year I'm moving to Denver. Driving 20k mi/yr. In 2029 we expect our second child.";
    const generate = vi.fn().mockResolvedValue(JSON.stringify({ intent: "CLARIFY", items: [] }));
    await createInterpreter(generate)(prompt, context);
    const quotes = generate.mock.calls[0][0].schema.properties.items.items.properties.quote.enum as string[];
    expect(quotes).toContain("next year I'm moving to Denver");
    expect(quotes).toContain("In 2029 we expect our second child");
    expect(quotes.every(quote => prompt.includes(quote))).toBe(true);
    expect(quotes).not.toContain("moving to Denver next year");
    expect(quotes).not.toContain("expect our second child in 2029");
  });

  it("identifies a date carried into an undated mileage clause during retry", async () => {
    const c = authored("demo"), wrong = structuredClone(c.expected);
    wrong.items.find(item => item.field === "annualMiles")!.month = "next year";
    const generate = vi.fn().mockResolvedValueOnce(JSON.stringify(wrong)).mockResolvedValueOnce(JSON.stringify(c.expected));
    const result = await createInterpreter(generate)(c.prompt, context);
    expect(generate.mock.calls[1][0].input.validationFeedback).toContain("annualMiles");
    expect(result.aiAvailable && result.proposals.find(event => event.type === "mileage_change")?.month).toBe(0);
  });

  it.each(["vague-time", "multiple"])("never defaults an omitted %s date to the current month", async id => {
    const c = authored(id), raw = captured(id);
    const result = await createInterpreter(async () => JSON.stringify(raw))(c.prompt, context);
    expect(result).toMatchObject({ aiAvailable: true, intent: "CLARIFY", proposals: [], profilePatches: [] });
  });

  it("gives validation feedback on retry and accepts a fully quoted correction", async () => {
    const c = authored("demo");
    const generate = vi.fn().mockResolvedValueOnce(JSON.stringify(captured("demo")))
      .mockResolvedValueOnce(JSON.stringify(c.expected));
    const before = structuredClone(context);
    const result = await createInterpreter(generate)(c.prompt, context);
    if (!result.aiAvailable) throw new Error("Expected structured result");
    expect(result.proposals.map(({ type, month, payload }) => ({ type, month, payload })))
      .toEqual(c.events.map(({ type, month, payload }) => ({ type, month, payload })));
    expect(generate.mock.calls[1][0].input.validationFeedback).toContain("timing");
    expect(result.proposals.every(event => event.status === "proposed")).toBe(true);
    expect(context).toEqual(before);
  });

  it("discards extra model items for comparison questions without losing the comparison intent", async () => {
    const c = authored("pure-rav4-question");
    const result = await createInterpreter(async () => JSON.stringify(captured(c.id)))(c.prompt, context);
    expect(result).toEqual({ aiAvailable: true, intent: "COMPARE_SCENARIOS", proposals: [], profilePatches: [] });
  });

  it("normalizes an unsupported diagnosis to clarification and creates no actions", async () => {
    const c = authored("unsupported");
    const result = await createInterpreter(async () => JSON.stringify(captured(c.id)))(c.prompt, context);
    expect(result).toMatchObject({ aiAvailable: true, intent: "CLARIFY", proposals: [], profilePatches: [], unsupportedReason: expect.stringContaining("cannot diagnose") });
  });

  it("rejects context values copied into a commute extraction instead of applying them", async () => {
    const c = authored("commute");
    const result = await createInterpreter(async () => JSON.stringify(captured(c.id)))(c.prompt, context);
    expect(result.aiAvailable).toBe(true);
    if (!result.aiAvailable) throw new Error("Expected independently grounded commute");
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0].payload).toEqual({ commuteMilesOneWay: 25, commuteDaysPerWeek: 3 });
    expect(result.unsupportedReason).toBeTruthy();
    const offline = interpretOffline(c.prompt, context.todayISO);
    expect(offline.events.some(event => event.payload.commuteMilesOneWay === 25)).toBe(true);
    expect(offline.events.some(event => event.payload.annualMiles === context.profile.annualMiles)).toBe(false);
  });

  it("does not mistake a vehicle model year for missing event timing", () => {
    const prompt = "Switch to a 2024 RAV4 Hybrid XLE.";
    const result = mapExtraction({ intent: "CREATE_SCENARIO", items: [{ field: "vehicleId", value: "2024 RAV4 Hybrid XLE", certainty: "clear", quote: "2024 RAV4 Hybrid XLE", assumptions: [] }] }, context, prompt);
    expect(result.unresolved).toEqual([]);
    expect(result.result.aiAvailable && result.result.proposals[0]).toMatchObject({ type: "vehicle_replacement", month: 0 });
  });
});
