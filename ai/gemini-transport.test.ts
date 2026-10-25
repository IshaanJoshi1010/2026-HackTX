// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const transport = vi.hoisted(() => ({ generateContent: vi.fn(), constructor: vi.fn(), acquire: vi.fn(), release: vi.fn(), failure: vi.fn() }));
vi.mock("@google/genai", () => ({ GoogleGenAI: class {
  models = { generateContent: transport.generateContent };
  constructor(options: unknown) { transport.constructor(options); }
} }));
vi.mock("./serviceGate", () => ({ geminiServiceGate: { acquire: transport.acquire, failure: transport.failure } }));
import { generateWithGemini } from "./gemini";
import { AIUnavailable } from "./status";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("GEMINI_API_KEY", "transport-test-not-a-real-key");
  vi.stubEnv("GEMINI_MODEL", "");
  transport.acquire.mockReturnValue({ ok: true, release: transport.release });
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("provider transport failure boundaries", () => {
  it.each([
    [429, "busy", 60],
    [503, "provider-error", 8],
    [504, "timeout", 8],
  ])("classifies HTTP %i without leaking provider details or retrying outside the request budget", async (status, expected, retryAfter) => {
    transport.generateContent.mockRejectedValue(Object.assign(new Error("private-provider-body transport-test-not-a-real-key"), { status }));
    const error = await generateWithGemini({ system: "rules", input: {}, purpose: "explain", timeoutMs: 2600 }).catch(error => error);
    expect(error).toBeInstanceOf(AIUnavailable);
    expect(error.statusInfo).toEqual({ status: expected, retryAfter });
    expect(error.message).not.toMatch(/private-provider-body|transport-test-not-a-real-key/);
    expect(transport.constructor).toHaveBeenCalledWith(expect.objectContaining({ httpOptions: { timeout: 10000, retryOptions: { attempts: 1 } } }));
    expect(transport.generateContent).toHaveBeenCalledTimes(1);
    expect(transport.failure).toHaveBeenCalledWith(status);
    expect(transport.release).toHaveBeenCalledTimes(1);
  });

  it("treats provider minimum-deadline HTTP400 as configuration failure, not elapsed time", async () => {
    transport.generateContent.mockRejectedValue(Object.assign(new Error("Request deadline of 7s is shorter than minimum deadline 10s"), { status: 400 }));
    await expect(generateWithGemini({ system: "rules", input: {}, timeoutMs: 7000 })).rejects.toMatchObject({ statusInfo: { status: "provider-error" } });
    expect(transport.release).toHaveBeenCalledTimes(1);
  });

  it("keeps the local seven-second deadline while giving Gemini an accepted provider deadline", async () => {
    vi.useFakeTimers();
    let providerSignal: AbortSignal | undefined;
    transport.generateContent.mockImplementation((request: { config: { abortSignal: AbortSignal } }) => new Promise((_, reject) => {
      providerSignal = request.config.abortSignal;
      providerSignal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    const pending = generateWithGemini({ system: "rules", input: {}, timeoutMs: 7000 });
    const checked = expect(pending).rejects.toMatchObject({ statusInfo: { status: "timeout" } });
    await vi.advanceTimersByTimeAsync(6999);
    expect(providerSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await checked;
    expect(providerSignal?.aborted).toBe(true);
    expect(transport.constructor).toHaveBeenCalledWith(expect.objectContaining({ httpOptions: { timeout: 10000, retryOptions: { attempts: 1 } } }));
    expect(transport.release).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retains the application deadline reason when the SDK throws a generic abort", async () => {
    const controller = new AbortController();
    transport.generateContent.mockImplementation(async () => {
      controller.abort(new AIUnavailable("AI request deadline", { status: "timeout" }));
      throw new DOMException("The operation was aborted", "AbortError");
    });
    await expect(generateWithGemini({ system: "rules", input: {}, signal: controller.signal })).rejects.toMatchObject({ statusInfo: { status: "timeout" } });
    expect(transport.release).toHaveBeenCalledTimes(1);
  });

  it("never consumes a generation slot for an already cancelled request", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(generateWithGemini({ system: "rules", input: {}, signal: controller.signal })).rejects.toMatchObject({ statusInfo: { status: "cancelled" } });
    expect(transport.acquire).not.toHaveBeenCalled();
    expect(transport.generateContent).not.toHaveBeenCalled();
  });

  it("returns a local busy signal without starting a paid provider request", async () => {
    transport.acquire.mockReturnValue({ ok: false, retryAfter: 3 });
    await expect(generateWithGemini({ system: "rules", input: {}, purpose: "explain" })).rejects.toMatchObject({ statusInfo: { status: "busy", retryAfter: 3 } });
    expect(transport.constructor).not.toHaveBeenCalled();
    expect(transport.generateContent).not.toHaveBeenCalled();
  });
});
