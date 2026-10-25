import { describe, expect, it } from "vitest";
import { ai } from "@/ui/mocks";
import type { SimAssumption } from "@/ui/mocks";
import { checkAgainstPrice, currentTerms, describeApplied, formatTerm, parseEntered, termsOf } from "./termsMath";

const fields = ai.scenarioTermFields;
const sim = (key: string, value: number | string, source: SimAssumption["source"] = "illustrative"): SimAssumption => ({ key, value, source, note: "" });

describe("currentTerms: what the sim is using now, with the label it reported", () => {
  const reported = [
    sim("insurancePerMonth", 130),
    sim("loanApr", 0.0612, "estimated"),
    sim("replacement.price", 31250, "estimated"),
    sim("replacement.salesTaxRate", 0.0625),
    sim("replacement.fees", 450),
    sim("replacement.downPayment", 3125),
    sim("replacement.apr", 0.065),
    sim("replacement.termMonths", 60),
    sim("annualMiles", 12000, "synthetic"),
  ];
  const now = currentTerms(reported, fields);

  it("reads each term, in the unit the person types it in (percent, not a fraction)", () => {
    expect(now.insurancePerMonth).toEqual({ value: 130, source: "illustrative" });
    expect(now.salesTaxPercent).toEqual({ value: 6.25, source: "illustrative" });
    expect(now.newLoanAprPercent).toEqual({ value: 6.5, source: "illustrative" });
    expect(now.loanAprPercent).toEqual({ value: 6.12, source: "estimated" });
    expect(now.newLoanTermMonths?.value).toBe(60);
  });

  it("carries the sim's own label, never one made up here", () => {
    expect(now.replacementPrice?.source).toBe("estimated");
  });

  it("has nothing for a term the sim did not report (no replacement yet)", () => {
    const none = currentTerms([sim("insurancePerMonth", 130)], fields);
    expect(none.replacementPrice).toBeUndefined();
    expect(none.newLoanAprPercent).toBeUndefined();
    expect(none.insurancePerMonth?.value).toBe(130);
  });

  it("covers every field the form offers", () => {
    expect(Object.keys(now).sort()).toEqual(fields.map((f) => f.field).sort());
  });
});

describe("formatTerm", () => {
  it("words each unit", () => {
    expect(formatTerm("insurancePerMonth", "USD/month", 150)).toBe("$150 a month");
    expect(formatTerm("replacementPrice", "USD", 30000)).toBe("$30,000");
    expect(formatTerm("salesTaxPercent", "percent", 6.25)).toBe("6.25%");
    expect(formatTerm("newLoanTermMonths", "months", 60)).toBe("60 months");
  });
});

describe("parseEntered: only what was filled in", () => {
  it("skips blank boxes and reads the rest as numbers", () => {
    expect(parseEntered({ insurancePerMonth: "150", replacementPrice: "", downPayment: "  ", salesTaxPercent: "6.25" })).toEqual({
      entered: { insurancePerMonth: 150, salesTaxPercent: 6.25 },
      bad: [],
    });
  });

  it("zero is a value, not a skip", () => {
    expect(parseEntered({ downPayment: "0" }).entered).toEqual({ downPayment: 0 });
  });

  it("forgives a dollar sign, a comma and a percent sign", () => {
    expect(parseEntered({ replacementPrice: "$30,000", newLoanAprPercent: "6.5%" }).entered).toEqual({ replacementPrice: 30000, newLoanAprPercent: 6.5 });
  });

  it("names the boxes that are not numbers instead of guessing", () => {
    expect(parseEntered({ insurancePerMonth: "lots", purchaseFees: "$" })).toEqual({ entered: {}, bad: ["insurancePerMonth", "purchaseFees"] });
  });
});

describe("checkAgainstPrice: a down payment alone is checked against the price in use", () => {
  it("refuses one that is more than the price in use", () => {
    expect(checkAgainstPrice({ downPayment: 40000 }, 31250)).toMatch(/more than the purchase price in use \(\$31,250\)/);
  });
  it("accepts one that fits, and has nothing to check without a price in use", () => {
    expect(checkAgainstPrice({ downPayment: 5000 }, 31250)).toBeNull();
    expect(checkAgainstPrice({ downPayment: 40000 }, undefined)).toBeNull();
  });
  it("leaves it to the shared helper when both are entered", () => {
    expect(checkAgainstPrice({ downPayment: 40000, replacementPrice: 30000 }, 31250)).toBeNull();
    expect(ai.prepareScenarioTerms({ downPayment: 40000, replacementPrice: 30000 }).ok).toBe(false);
  });
});

describe("what the shared helper makes of the entered terms", () => {
  it("converts percent once, in code, and labels every term as the person's own", () => {
    const r = ai.prepareScenarioTerms({ insurancePerMonth: 150, salesTaxPercent: 6.25, newLoanAprPercent: 6.5, newLoanTermMonths: 60 });
    expect(r).toMatchObject({ ok: true, status: "proposed", assumptions: { insurancePerMonth: 150, salesTaxRate: 0.0625, newLoanApr: 0.065, newLoanTermMonths: 60 } });
    if (r.ok) expect(Object.values(r.provenance).every((s) => s === "user")).toBe(true);
  });

  it("empty input gives empty terms, never invented ones", () => {
    expect(ai.prepareScenarioTerms({})).toMatchObject({ ok: true, assumptions: {} });
  });

  it("refuses a term out of range (1 to 120 months)", () => {
    expect(ai.prepareScenarioTerms({ newLoanTermMonths: 0 }).ok).toBe(false);
    expect(ai.prepareScenarioTerms({ newLoanTermMonths: 121 }).ok).toBe(false);
  });
});

describe("describeApplied and termsOf", () => {
  it("shows the terms in effect in the person's own units, in the order of the form", () => {
    const applied = describeApplied({ salesTaxRate: 0.0625, insurancePerMonth: 150, startYear: 2027 }, fields);
    expect(applied.map((a) => [a.label, a.text])).toEqual([
      ["Insurance per month", "$150 a month"],
      ["Sales tax", "6.25%"],
    ]);
  });

  it("termsOf keeps only the keys the form can set", () => {
    expect(termsOf({ insurancePerMonth: 150, startYear: 2027, annualMilesOverride: 9000 })).toEqual({ insurancePerMonth: 150 });
  });
});
