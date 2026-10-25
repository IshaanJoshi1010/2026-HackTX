import "server-only";
import { geminiServiceGate } from "./serviceGate";
import { GoogleGenAI } from "@google/genai";
export interface GenerationRequest { system: string; input: unknown; schema?: Record<string, unknown>; signal?: AbortSignal; timeoutMs?: number; purpose?: "interpret" | "explain" }
export type Generator = (request: GenerationRequest) => Promise<string>;
import { AIUnavailable } from "./status";
export { AIUnavailable } from "./status";
export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";
// The SDK sends its timeout as X-Server-Timeout. Gemini rejects deadlines below
// 10 seconds, even when our own request budget deliberately ends earlier.
const PROVIDER_TIMEOUT_MS = 10_000;
export const generateWithGemini: Generator = async request => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new AIUnavailable("AI unavailable", { status: "unconfigured" });
  if (request.signal?.aborted) throw new AIUnavailable("AI request ended", { status: "cancelled" });
  const permit = geminiServiceGate.acquire(request.purpose);
  if (!permit.ok) throw new AIUnavailable("AI temporarily unavailable", { status: "busy", retryAfter: permit.retryAfter });
  const controller = new AbortController();
  const abort = () => controller.abort(request.signal?.reason instanceof AIUnavailable
    ? request.signal.reason : new AIUnavailable("AI request ended", { status: "cancelled" }));
  request.signal?.addEventListener("abort", abort, { once: true });
  const localTimeoutMs = Number.isFinite(request.timeoutMs)
    ? Math.max(1, Math.min(request.timeoutMs!, 10_000)) : 10_000;
  const timer = setTimeout(() => controller.abort(new AIUnavailable("AI request deadline", { status: "timeout" })), localTimeoutMs);
  try {
    const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: PROVIDER_TIMEOUT_MS, retryOptions: { attempts: 1 } } });
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL,
      contents: JSON.stringify(request.input),
      config: { abortSignal: controller.signal, systemInstruction: request.system, temperature: 0, maxOutputTokens: 4096,
        ...(request.schema ? { responseMimeType: "application/json", responseJsonSchema: request.schema } : {}) },
    });
    if (!response.text) throw new AIUnavailable("Empty AI response", { status: "invalid-response" });
    return response.text;
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 0;
    geminiServiceGate.failure(status);
    if (error instanceof AIUnavailable) throw error;
    if (controller.signal.aborted && controller.signal.reason instanceof AIUnavailable) throw controller.signal.reason;
    // Invalid arguments can mention "deadline" too. A provider's HTTP status is
    // authoritative; only classify untyped network errors from their message.
    const timedOut = status === 408 || status === 504 || (!status && error instanceof Error && /timeout|timed out|deadline/i.test(`${error.name} ${error.message}`));
    if (timedOut) throw new AIUnavailable("AI request deadline", { status: "timeout", ...(status === 504 ? { retryAfter: 8 } : {}) });
    throw new AIUnavailable("AI provider unavailable", status === 429 ? { status: "busy", retryAfter: 60 }
      : request.signal?.aborted ? { status: "cancelled" } : { status: "provider-error", ...(status === 503 || status === 504 ? { retryAfter: 8 } : {}) });
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener("abort", abort);
    permit.release();
  }
};
