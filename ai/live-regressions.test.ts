import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import captures from "./fixtures/live-extraction-failures.json";
import { createInterpreter } from "./interpret";
import { mapExtraction } from "./mapper";
import { testDumps } from "./testDumps";
import { alexProfile } from "../data/fixtures/alex";

const context = { vehicle: { make: "Toyota", model: "Camry", year: 2022, trim: "SE" }, profile: alexProfile, existingEvents: [], todayISO: "2026-10-24" };
const captured = (id: string) => captures.cases.find(c => c.id === id)!.responses[0];
const authored = (id: string) => testDumps.find(c => c.id === id)!;

describe("captured live extraction failure regressions", () => {
  it.each(["vague-time", "multiple"])("never defaults an omitted %s date to the current month", async id => {
    const c = authored(id), raw = captured(id);
    const result = await createInterpreter(async () => JSON.stringify(raw))(c.prompt, context);
    expect(result).toEqual({ aiAvailable: true, intent: "CLARIFY", proposals: [], profilePatches: [] });
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
    expect(result).toEqual({ aiAvailable: true, intent: "CLARIFY", proposals: [], profilePatches: [] });
  });

  it("does not mistake a vehicle model year for missing event timing", () => {
    const prompt = "Switch to a 2024 RAV4 Hybrid XLE.";
    const result = mapExtraction({ intent: "CREATE_SCENARIO", items: [{ field: "vehicleId", value: "2024 RAV4 Hybrid XLE", certainty: "clear", quote: "2024 RAV4 Hybrid XLE", assumptions: [] }] }, context, prompt);
    expect(result.unresolved).toEqual([]);
    expect(result.result.aiAvailable && result.result.proposals[0]).toMatchObject({ type: "vehicle_replacement", month: 0 });
  });
});
