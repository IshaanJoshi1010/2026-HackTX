import { describe, expect, it } from "vitest";
import { dateLabel, whenLabel } from "./dates";

describe("dateLabel", () => {
  it("month 0 is the month the date is in", () => {
    expect(dateLabel("2026-10-24", 0)).toBe("Oct 2026");
    expect(dateLabel("2026-01-01", 0)).toBe("Jan 2026");
    expect(dateLabel("2026-12-31", 0)).toBe("Dec 2026");
  });

  it("counts calendar months forward and rolls over the year", () => {
    expect(dateLabel("2026-10-24", 1)).toBe("Nov 2026");
    expect(dateLabel("2026-10-24", 3)).toBe("Jan 2027");
    expect(dateLabel("2026-10-24", 12)).toBe("Oct 2027");
    expect(dateLabel("2026-10-24", 32)).toBe("Jun 2029");
    expect(dateLabel("2026-10-24", 60)).toBe("Oct 2031");
    expect(dateLabel("2026-12-31", 1)).toBe("Jan 2027");
  });

  it("only uses the year and month, so the day cannot move a label", () => {
    expect(dateLabel("2026-10-01", 5)).toBe(dateLabel("2026-10-31", 5));
    expect(dateLabel("2026-10-31", 4)).toBe("Feb 2027");
  });

  it("reads a full timestamp, a leap day, and just a month", () => {
    expect(dateLabel("2026-10-24T23:59:59Z", 2)).toBe("Dec 2026");
    expect(dateLabel("2024-02-29", 12)).toBe("Feb 2025");
    expect(dateLabel("2026-10", 2)).toBe("Dec 2026");
  });

  it("is the same wherever it runs (no time zone, no locale)", () => {
    const labels = Array.from({ length: 61 }, (_, m) => dateLabel("2026-10-24", m));
    expect(labels.every((l) => /^[A-Z][a-z]{2} \d{4}$/.test(l))).toBe(true);
    expect(new Set(labels).size).toBe(61);
  });

  it("gives an empty string, never NaN, for bad input", () => {
    for (const bad of ["", "not a date", "2026", "2026-13-01", "2026-00-10", "2026-02-30", "2025-02-29", "2026-10-32", "2026/10/24", "26-10-24"]) {
      expect(dateLabel(bad, 3)).toBe("");
    }
    expect(dateLabel(undefined as unknown as string, 3)).toBe("");
    expect(dateLabel(null as unknown as string, 3)).toBe("");
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, 1e300, "5" as unknown as number, undefined as unknown as number]) {
      const out = dateLabel("2026-10-24", bad);
      expect(out).toBe("");
      expect(out).not.toMatch(/NaN|undefined|Infinity/);
    }
  });

  it("rounds a fractional month rather than printing a fraction", () => {
    expect(dateLabel("2026-10-24", 11.6)).toBe("Oct 2027");
  });
});

describe("whenLabel", () => {
  it("says Now for month 0", () => {
    expect(whenLabel(0)).toBe("Now");
  });

  it("says how far away in years and months", () => {
    expect(whenLabel(1)).toBe("In 1 mo");
    expect(whenLabel(8)).toBe("In 8 mo");
    expect(whenLabel(12)).toBe("In 1 yr");
    expect(whenLabel(13)).toBe("In 1 yr 1 mo");
    expect(whenLabel(32)).toBe("In 2 yr 8 mo");
    expect(whenLabel(60)).toBe("In 5 yr");
  });

  it("gives an empty string, never NaN, for bad input", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -3, "7" as unknown as number, undefined as unknown as number]) {
      expect(whenLabel(bad)).toBe("");
    }
  });
});
