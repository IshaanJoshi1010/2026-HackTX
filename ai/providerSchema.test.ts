// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { toProviderSchema } from "./providerSchema";
import { createInterpreter } from "./interpret";
import { ExtractionSchema } from "./schema";
const context = { vehicle: { make: "Toyota", model: "Camry", year: 2022, trim: "SE" }, profile: {}, existingEvents: [], todayISO: "2026-10-24" };

describe("Gemini wire-schema compatibility regression", () => {
  it("removes grammar length bounds without mutating the local schema or losing quote enums and types", () => {
    const original = { type: "object", additionalProperties: false, required: ["items"], properties: {
      items: { type: "array", minItems: 1, maxItems: 32, items: { type: "object", properties: { quote: { type: "string", minLength: 1, maxLength: 8000, enum: ["exact user quote"] } } } },
      maxLength: { type: "string", maxLength: 10 },
    } };
    const before = structuredClone(original), wire = toProviderSchema(original);
    expect(original).toEqual(before);
    expect(wire).toEqual({ type: "object", additionalProperties: false, required: ["items"], properties: {
      items: { type: "array", items: { type: "object", properties: { quote: { type: "string", enum: ["exact user quote"] } } } },
      maxLength: { type: "string" },
    } });
  });
  it("sends compatible schemas on both attempts while still rejecting oversized local extraction arrays", async () => {
    const prompt = "I drive 12000 miles per year";
    const bad = { intent: "CREATE_SCENARIO", items: Array.from({ length: 33 }, () => ({ field: "annualMiles", value: 12000, quote: prompt, certainty: "clear", assumptions: [] })) };
    const generate = vi.fn().mockResolvedValue(JSON.stringify(bad));
    expect(await createInterpreter(generate)(prompt, context)).toMatchObject({ intent: "CLARIFY", proposals: [] });
    expect(generate).toHaveBeenCalledTimes(2);
    for (const [request] of generate.mock.calls) {
      expect(request.schema.properties.items.maxItems).toBeUndefined();
      expect(request.schema.properties.items.items.properties.quote.enum).toContain(prompt);
    }
    expect(ExtractionSchema.safeParse(bad).success).toBe(false);
  });
  it("still rejects long quotes and assumptions in the local validator", () => {
    for (const item of [
      { quote: "x".repeat(8001), assumptions: [] },
      { quote: "user quote", assumptions: ["x".repeat(501)] },
      { quote: "user quote", assumptions: Array.from({ length: 11 }, () => "reason") },
    ]) expect(ExtractionSchema.safeParse({ intent: "CREATE_SCENARIO", items: [{ field: "annualMiles", value: 12000, certainty: "clear", ...item }] }).success).toBe(false);
  });
});
