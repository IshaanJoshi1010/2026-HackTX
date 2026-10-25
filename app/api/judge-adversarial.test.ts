// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const sdk = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@google/genai", () => ({ GoogleGenAI: class { models = { generateContent: sdk.generate }; } }));
import { POST as interpret } from "./interpret/route";
import { POST as explain } from "./explain/route";
import { readJsonBody } from "./requestBody";
const context = { vehicle: { make: "Toyota", model: "Camry", year: 2022, trim: "SE" }, profile: {}, existingEvents: [], todayISO: "2026-10-24" };
const evaluation = { scenarioIds: ["keep"], hardConstraints: [], preferredScenarioId: "keep", rationale: [], sensitivity: [], nextAction: { label: "Review", detail: "Review assumptions" } };
const results = [{ scenarioId: "keep", points: [], milestones: [], warnings: [], summary: { totalCash: 10000, netCost: 12000 } }];
const req = (body: unknown) => new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => { sdk.generate.mockReset(); vi.stubEnv("GEMINI_API_KEY", "TEST_ONLY_NOT_A_REAL_KEY"); });
afterEach(() => vi.unstubAllEnvs());

describe("judge: API rejects malformed and abusive payloads before AI", () => {
  it.each([null, [], true, 123, "hi", {}, { prompt: "hi" }, { context }, { prompt: "", context }, { prompt: "x".repeat(8001), context }, { prompt: "hi", context: { ...context, todayISO: "2026-02-30" } }, { prompt: "hi", context: { ...context, profile: { annualMiles: -1 } } }, { prompt: "hi", context: { ...context, existingEvents: [{ type: "relocation", month: -1 }] } }, { prompt: "hi", context, key: "override" }, JSON.parse('{"__proto__":{"polluted":true}}')])("rejects invalid interpretation data", async body => {
    const response = await interpret(req(body));
    expect(response.status).toBe(400);
    expect(sdk.generate).not.toHaveBeenCalled();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(JSON.stringify(await response.json())).not.toContain("TEST_ONLY_NOT_A_REAL_KEY");
  });
  it.each([null, [], {}, { evaluation }, { evaluation, results: [] }, { evaluation, results: [...results, ...results] }, { evaluation, results: Array.from({ length: 21 }, () => results[0]) }, { evaluation: { ...evaluation, preferredScenarioId: "wrong" }, results }, { evaluation, results: [{ ...results[0], summary: { totalCash: -Infinity, netCost: null } }] }])("rejects malformed or inconsistent explanations", async body => {
    const response = await explain(req(body));
    expect(response.status).toBe(400); expect(sdk.generate).not.toHaveBeenCalled();
  });
  it.each([interpret, explain])("rejects a truly oversized streamed body even with a forged small Content-Length", async route => {
    const request = new Request("http://localhost/api", { method: "POST", body: "x".repeat(600000), headers: { "content-length": "1" } });
    expect((await route(request)).status).toBe(413);
    expect(sdk.generate).not.toHaveBeenCalled();
  });
  it("rejects malformed UTF-8 without calling the provider", async () => {
    const stream = new ReadableStream({ start(controller) { controller.enqueue(Uint8Array.of(0xc3, 0x28)); controller.close(); } });
    const request = new Request("http://localhost/api", { method: "POST", body: stream, duplex: "half" } as RequestInit);
    expect((await interpret(request)).status).toBe(400);
    expect(sdk.generate).not.toHaveBeenCalled();
  });
  it("handles an interrupted stream as a server failure without exposing private errors", async () => {
    const stream = new ReadableStream({ start(controller) { controller.error(new Error("PRIVATE_STREAM_ERROR")); } });
    const response = await interpret(new Request("http://localhost/api", { method: "POST", body: stream, duplex: "half" } as RequestInit));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Unable to process request" });
    expect(sdk.generate).not.toHaveBeenCalled();
  });
  it("correctly decodes JSON when every multibyte UTF-8 character is split across chunks", async () => {
    const encoded = new TextEncoder().encode(JSON.stringify({ location: "Montréal 東京 🚗" }));
    const stream = new ReadableStream({ start(controller) { for (const byte of encoded) controller.enqueue(Uint8Array.of(byte)); controller.close(); } });
    const request = new Request("http://localhost/api", { method: "POST", body: stream, duplex: "half" } as RequestInit);
    expect(await readJsonBody(request, 1024)).toEqual({ location: "Montréal 東京 🚗" });
  });
  it("works without any key for both valid API routes", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const a = await interpret(req({ prompt: "hi", context })), b = await explain(req({ evaluation, results }));
    expect(a.status).toBe(200); expect(await a.json()).toEqual({ aiAvailable: false });
    expect(b.status).toBe(200); expect(await b.json()).toMatchObject({ usedFallback: true, aiAvailable: false });
    expect(sdk.generate).not.toHaveBeenCalled();
  });
});

describe("judge: concurrent route recovery with no paid traffic", () => {
  it("bounds a 50-request mixed-route burst to two provider calls and returns valid fallback responses", async () => {
    let release!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; });
    sdk.generate.mockImplementation(async (args: { config: { responseJsonSchema?: unknown } }) => {
      await hold;
      return { text: args.config.responseJsonSchema ? '{"intent":"CLARIFY","items":[]}' : "Review the supplied comparison." };
    });
    const pending = Array.from({ length: 50 }, (_, i) => i % 2 === 0 ? interpret(req({ prompt: "hi", context })) : explain(req({ evaluation, results })));
    try { await vi.waitFor(() => expect(sdk.generate).toHaveBeenCalledTimes(2)); }
    finally { release(); }
    const responses = await Promise.all(pending);
    expect(sdk.generate).toHaveBeenCalledTimes(2);
    const bodies = await Promise.all(responses.map(r => r.json()));
    expect(responses.every(r => r.status === 200)).toBe(true);
    expect(bodies.filter((_, i) => i % 2 === 0).every(body => typeof body.aiAvailable === "boolean")).toBe(true);
    expect(bodies.filter((_, i) => i % 2 === 1).every(body => typeof body.usedFallback === "boolean" && typeof body.text === "string")).toBe(true);
    expect(JSON.stringify(bodies)).not.toContain("TEST_ONLY_NOT_A_REAL_KEY");
  });
});
