import { describe, expect, it } from "vitest";
import { customerText } from "./customerText";

// The exact strings other modules hand the UI today.
const FROM_OTHER_MODULES = [
  ["demo vehicle purchase and ownership start", "Vehicle purchase and ownership start"],
  ["current demo odometer", "current odometer"],
  ["These demo results are not a financial quote.", "These results are not a financial quote."],
  ["Unsupported demo vehicle", "Unsupported vehicle"],
  ["The saved demo vehicle could not be loaded", "The saved vehicle could not be loaded"],
  ["Estimated demo finance only; no account or credit data was accessed.", "Estimated finance only; no account or credit information was accessed."],
  ["Provider data or profile failed validation", "Provider information or profile failed validation"],
  ["Connection provider is unavailable; no account data was applied", "Connection provider is unavailable; no account information was applied"],
  ["Twin could not be built: provider data or history is unavailable or invalid", "Twin could not be built: provider information or history is unavailable or invalid"],
  ["Demo assumptions only; 20% down, 7% illustrative APR.", "Assumptions only; 20% down, 7% illustrative APR."],
  ["From a public dataset such as EPA fuel economy.", "From a public source such as EPA fuel economy."],
  ["Made-up demo persona data. Not a real account.", "Made-up persona information. Not a real account."],
  ["It is demo data.", "It is illustrative figures."],
] as const;

describe("customerText", () => {
  it.each(FROM_OTHER_MODULES)("%s", (input, expected) => {
    expect(customerText(input)).toBe(expected);
    expect(customerText(input)).not.toMatch(/demo|data/i);
  });

  it("a sentence that begins with the word keeps its capital on the next word", () => {
    expect(customerText("Estimate. Demo finance is a guess.")).toBe("Estimate. Finance is a guess.");
    expect(customerText("Demo mileage")).toBe("Mileage");
  });

  it("a lone word becomes a plain one", () => {
    expect(customerText("for the demo.")).toBe("for the sample.");
    expect(customerText("Data")).toBe("Information");
  });

  it("leaves everything else exactly alone", () => {
    for (const text of ["", "Keep your Camry", "Costs $4,310 more than keeping", "Updated and validated", "Close call. Neither car clearly leads."]) {
      expect(customerText(text)).toBe(text);
    }
  });

  it("is a pure function: the same words give the same words", () => {
    expect(customerText("demo data")).toBe(customerText("demo data"));
    expect(customerText(customerText("demo data"))).toBe(customerText("demo data"));
  });
});
