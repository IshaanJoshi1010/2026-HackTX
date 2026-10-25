import { describe, expect, it } from "vitest";
import { monthLabel, sentence, usd } from "./format";

describe("sentence", () => {
  it("is sentence case, never all capitals", () => {
    expect(sentence("low")).toBe("Low");
    expect(sentence("paid_off")).toBe("Paid off");
    expect(sentence("loan")).toBe("Loan");
    expect(sentence("")).toBe("");
  });
});

describe("the number formats", () => {
  it("prints dollars the same way every time", () => {
    expect(usd(31287)).toBe("$31,287");
  });
  it("words a month on the axis", () => {
    expect(monthLabel(0)).toBe("Now");
    expect(monthLabel(8)).toBe("8 mo");
    expect(monthLabel(12)).toBe("1 yr");
    expect(monthLabel(32)).toBe("2 yr 8 mo");
  });
});
