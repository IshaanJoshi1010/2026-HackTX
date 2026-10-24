import { describe, expect, it } from "vitest";
import type { Source } from "@/contracts";
import { VARIANT_LABEL, variantOf, weakestSource } from "./sources";

describe("variantOf", () => {
  it("covers all six contract sources", () => {
    const all: Source[] = ["sourced", "listing", "user", "estimated", "illustrative", "synthetic"];
    expect(all.map((s) => VARIANT_LABEL[variantOf(s)])).toEqual([
      "sourced",
      "listing",
      "your input",
      "estimated",
      "demo data",
      "demo data",
    ]);
  });

  it("keeps sourced (EPA) apart from listing", () => {
    expect(variantOf("sourced")).not.toBe(variantOf("listing"));
  });
});

describe("weakestSource", () => {
  it("returns the least real input", () => {
    expect(weakestSource(["user", "sourced"])).toBe("sourced");
    expect(weakestSource(["sourced", "estimated", "user"])).toBe("estimated");
    expect(weakestSource(["estimated", "synthetic", "illustrative"])).toBe("synthetic");
  });

  it("returns the only source for a single input", () => {
    expect(weakestSource(["listing"])).toBe("listing");
  });

  it("refuses to label when any input has no source", () => {
    expect(weakestSource(["user", undefined])).toBeUndefined();
  });

  it("refuses to label an empty list", () => {
    expect(weakestSource([])).toBeUndefined();
  });
});
