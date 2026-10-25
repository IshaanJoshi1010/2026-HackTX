import "server-only";
import { geminiServiceGate } from "./serviceGate";
import { GoogleGenAI } from "@google/genai";
export interface GenerationRequest { system: string; input: unknown; schema?: Record<string, unknown> }
export type Generator = (request: GenerationRequest) => Promise<string>;
export class AIUnavailable extends Error {}
/** The model the team tested live (ai/INTEGRATION.md). The previous default timed out, which cost a 15 s wait before the fallback. */
export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";
export const generateWithGemini: Generator = async request => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new AIUnavailable("AI unavailable");
  const permit = geminiServiceGate.acquire();
  if (!permit.ok) throw new AIUnavailable("AI temporarily unavailable; try again later or use manual entry");
  try {
    const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 15000, retryOptions: { attempts: 1 } } });
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL,
      contents: JSON.stringify(request.input),
      config: { systemInstruction: request.system, temperature: 0, maxOutputTokens: 4096,
        ...(request.schema ? { responseMimeType: "application/json", responseJsonSchema: request.schema } : {}) },
    });
    if (!response.text) throw new AIUnavailable("AI unavailable");
    return response.text;
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 0;
    geminiServiceGate.failure(status);
    throw error;
  } finally { permit.release(); }
};
