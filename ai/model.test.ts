import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const sdk = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock("@google/genai", () => ({ GoogleGenAI: class { models = { generateContent: sdk.generateContent }; } }));
import { DEFAULT_GEMINI_MODEL, generateWithGemini } from "./gemini";

beforeEach(() => { sdk.generateContent.mockReset(); sdk.generateContent.mockResolvedValue({ text: "ok" }); });
afterEach(() => vi.unstubAllEnvs());

const modelUsed = async () => {
  await generateWithGemini({ system: "rules", input: {} });
  return sdk.generateContent.mock.calls[0][0].model;
};

describe("the Gemini model default (audit A1)", () => {
  it("is the model the team tested live, not the one that timed out", () => {
    expect(DEFAULT_GEMINI_MODEL).toBe("gemini-3.1-flash-lite");
    expect(DEFAULT_GEMINI_MODEL).not.toBe("gemini-3.8-flash");
  });

  it("is used when GEMINI_MODEL is unset, empty or only spaces", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-only-not-a-credential");
    for (const value of [undefined, "", "   "]) {
      sdk.generateContent.mockClear();
      if (value === undefined) {
        vi.unstubAllEnvs();
        vi.stubEnv("GEMINI_API_KEY", "test-only-not-a-credential");
      } else {
        vi.stubEnv("GEMINI_MODEL", value);
      }
      expect(await modelUsed()).toBe(DEFAULT_GEMINI_MODEL);
    }
  });

  it("an explicit GEMINI_MODEL still wins", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-only-not-a-credential");
    vi.stubEnv("GEMINI_MODEL", "some-other-model");
    expect(await modelUsed()).toBe("some-other-model");
  });

  it("the example env file shows the same default, so a copied example does not bring the old wait back", () => {
    const example = readFileSync(".env.example", "utf8");
    expect(example).toMatch(new RegExp(`^GEMINI_MODEL=${DEFAULT_GEMINI_MODEL}$`, "m"));
    expect(example).toMatch(/^GEMINI_API_KEY=$/m); // and it still holds no key
  });
});
