import { describe, expect, it } from "vitest";
import { monthLabel, sentence, signedUsd, usd } from "./format";

describe("sentence", () => {
  it("is sentence case, never all capitals", () => {
    expect(sentence("low")).toBe("Low");
    expect(sentence("paid_off")).toBe("Paid off");
    expect(sentence("loan")).toBe("Loan");
    expect(sentence("")).toBe("");
  });
});

describe("the number formats", () => {
  it("prints dollars and differences the same way every time", () => {
    expect(usd(31287)).toBe("$31,287");
    expect(signedUsd(5912)).toBe("+$5,912");
    expect(signedUsd(-800)).toBe("-$800");
    expect(signedUsd(0.2)).toBe("$0");
  });
  it("words a month on the axis", () => {
    expect(monthLabel(0)).toBe("Now");
    expect(monthLabel(8)).toBe("8 mo");
    expect(monthLabel(12)).toBe("1 yr");
    expect(monthLabel(32)).toBe("2 yr 8 mo");
  });
});
