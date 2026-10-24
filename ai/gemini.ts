import "server-only";
import { GoogleGenAI } from "@google/genai";
export interface GenerationRequest { system: string; input: unknown; schema?: Record<string, unknown> }
export type Generator = (request: GenerationRequest) => Promise<string>;
export class AIUnavailable extends Error {}
export const generateWithGemini: Generator = async request => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new AIUnavailable("AI unavailable");
  const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 15000, retryOptions: { attempts: 1 } } });
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash",
    contents: JSON.stringify(request.input),
    config: { systemInstruction: request.system, temperature: 0, maxOutputTokens: 4096,
      ...(request.schema ? { responseMimeType: "application/json", responseJsonSchema: request.schema } : {}) },
  });
  if (!response.text) throw new AIUnavailable("AI unavailable");
  return response.text;
};
