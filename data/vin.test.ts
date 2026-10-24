import { describe, expect, it } from "vitest";
import { validateVin } from "./vin";

// Public checksum example, not a Fork demo VIN or a listing.
const sample = "1M8GDM9AXKP042788";
describe("validateVin", () => {
  it("accepts 17 valid characters and normalizes lowercase", () => {
    expect(validateVin(sample.toLowerCase())).toEqual({ ok: true, vin: sample });
  });
  it.each(["", "123", sample + "1", " " + sample])("rejects incorrect length: %s", vin => {
    expect(validateVin(vin)).toEqual({ ok: false, reason: "length" });
  });
  it.each(["I", "O", "Q", "i", "o", "q"])("rejects forbidden %s", c => {
    expect(validateVin(c + sample.slice(1))).toEqual({ ok: false, reason: "forbidden_letter" });
  });
  it.each(["*", "-", " ", "é", "ß"])("rejects invalid character %s", c => {
    expect(validateVin(c + sample.slice(1))).toEqual({ ok: false, reason: "chars" });
  });
  it("checks a known checksum with X and detects a single digit change only when enabled", () => {
    expect(validateVin(sample, { checkDigit: true }).ok).toBe(true);
    expect(validateVin("1M8GDM9AXKP042789", { checkDigit: true })).toEqual({ ok: false, reason: "check_digit" });
    expect(validateVin("1M8GDM9AXKP042789").ok).toBe(true);
    expect(validateVin("1HGCM82633A004352", { checkDigit: true }).ok).toBe(true);
  });
  it("handles unexpected runtime values without throwing", () => {
    expect(validateVin(null as unknown as string).ok).toBe(false);
  });
});
