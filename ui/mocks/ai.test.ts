import { afterEach, describe, expect, it, vi } from "vitest";
import type { InterpretContext } from "@/contracts";
import { ai } from "./index";

/**
 * The AI lives on the server. Whatever goes wrong between the browser and Gemini (no key, a failing call, a quota
 * or cooldown on the server, a slow or broken network, an oversized or garbled reply) must reach the store as
 * "not available", never as an exception and never as a hang, so the plain rules can take over.
 */
const ctx: InterpretContext = {
  vehicle: { make: "Toyota", model: "Camry", year: 2022, trim: "SE" },
  profile: {},
  existingEvents: [],
  todayISO: "2026-10-24",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("interpret: every way it can fail reads as 'not available'", () => {
  it("the server says so (no key, Gemini failing, a quota or a cooldown all look like this)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ aiAvailable: false })));
    expect(await ai.interpret("hi", ctx)).toEqual({ aiAvailable: false });
  });

  it.each([400, 413, 429, 499, 500, 502, 503, 504])("an HTTP %i", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: "nope" }, status)));
    expect(await ai.interpret("hi", ctx)).toEqual({ aiAvailable: false });
  });

  it("the network is down", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(await ai.interpret("hi", ctx)).toEqual({ aiAvailable: false });
  });

  it("a reply that is not the agreed shape", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ intent: "CREATE_SCENARIO", proposals: "lots" })));
    expect(await ai.interpret("hi", ctx)).toEqual({ aiAvailable: false });
  });

  it("a reply that is not JSON at all", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>gateway</html>", { status: 200 })));
    expect(await ai.interpret("hi", ctx)).toEqual({ aiAvailable: false });
  });

  it("a request that never answers is cut off after 15 seconds, so nothing hangs", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))),
    );
    const asked = ai.interpret("hi", ctx);
    await vi.advanceTimersByTimeAsync(14_999);
    let done = false;
    void asked.then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(await asked).toEqual({ aiAvailable: false });
  });

  it("a good answer comes through untouched, and the request goes to our own server only", async () => {
    const answer = { aiAvailable: true, intent: "COMPARE_SCENARIOS", proposals: [], profilePatches: [] };
    const fetchSpy = vi.fn().mockResolvedValue(json(answer));
    vi.stubGlobal("fetch", fetchSpy);
    expect(await ai.interpret("would a RAV4 make more sense?", ctx)).toEqual(answer);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/interpret"); // a relative URL: never a key, never another host
    expect(JSON.stringify(fetchSpy.mock.calls[0][1])).not.toMatch(/api[_-]?key|authorization/i);
  });
});

describe("explain: a failure means no summary, never an error on the page", () => {
  const evaluation = { scenarioIds: ["a"], hardConstraints: [], preferredScenarioId: "inconclusive", rationale: [], sensitivity: [], nextAction: { label: "x", detail: "y" } } as never;

  it.each([429, 500, 503])("an HTTP %i rejects, which the store ignores", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: "nope" }, status)));
    await expect(ai.explain(evaluation, [])).rejects.toThrow();
  });

  it("the network is down", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(ai.explain(evaluation, [])).rejects.toThrow();
  });

  it("a template summary is passed through as written offline, and says so", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ text: "Close call.", usedFallback: true, aiAvailable: false })));
    expect(await ai.explain(evaluation, [])).toEqual({ text: "Close call.", usedFallback: true });
  });
});
