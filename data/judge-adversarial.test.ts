// @vitest-environment node
import { describe, expect, it } from "vitest";
import { normalizeOnboarding } from "./normalize";
import { validateVin } from "./vin";
import { mapTradeoffs } from "./tradeoffs";
import { createVehicleIdentifier } from "./decode";
import { demoVins } from "./registry";
import { DriverProfileSchema } from "../contracts/schemas";
import { buildTwin } from "./twin";
import { getRegistryVehicles } from "./registry";
import { applyDefaults } from "./defaults";

describe("judge: hostile profile input", () => {
  it.each([null, [], 12, "12000", { children: -1 }, { children: 1.5 }, { householdSize: 2, children: 3 }, { commuteDaysPerWeek: 8 }, { fuelPricePerGal: Infinity }, { annualMiles: NaN }, { annualMiles: Number.MAX_VALUE }, { financePayment: Number.MAX_VALUE }, { annualMiles: "$500/month" }, { annualMiles: "$500" }, { children: "$3" }, { children: "3 miles" }, { annualMiles: "9".repeat(10000) }, JSON.parse('{"__proto__":{"polluted":true}}'), { constructor: { prototype: { polluted: true } } }])("rejects invalid input without throwing", input => {
    let result: ReturnType<typeof normalizeOnboarding> | undefined;
    expect(() => { result = normalizeOnboarding(input as never); }).not.toThrow();
    expect(result?.ok).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it.each([
    { annualMiles: "25 miles each way" }, { annualMiles: "25 mi one way" },
    { financeType: "paid_off", financePayment: 500 }, { financeType: "loan", financeEndMonth: 12 },
  ])("rejects mismatched units and explicit finance contradictions", input => {
    expect(normalizeOnboarding(input).ok).toBe(false);
  });
  it("keeps a one-way commute in its own field rather than silently converting its units", () => {
    const result = normalizeOnboarding({ commuteMilesOneWay: "25 miles each way" });
    expect(result.ok && result.profile.commuteMilesOneWay).toBe(25);
    expect(result.ok && result.profile.annualMiles).toBeUndefined();
  });
  it("rejects unsafe explicit and connected odometers without returning a half-built twin", async () => {
    const vehicle = getRegistryVehicles()[demoVins.camry.primary];
    const explicit = await buildTwin({ vehicle, mileage: Number.MAX_VALUE });
    expect(explicit.ok).toBe(false); expect(explicit).not.toHaveProperty("twin");
    const connected = await buildTwin({ vehicle, provider: {
      getAccount: async () => ({ source: "synthetic", finance: { financeType: "paid_off", balance: 0, monthlyPayment: 0, remainingTermMonths: 0, provenance: { financeType: "synthetic" } } }),
      getVehicleSignals: async () => ({ source: "synthetic", mileage: Number.MAX_VALUE }),
    } });
    expect(connected.ok).toBe(false); expect(connected).not.toHaveProperty("twin");
  });
  it("does not overflow when deriving mileage from huge commute inputs", () => {
    expect(normalizeOnboarding({ commuteMilesOneWay: Number.MAX_VALUE / 2, commuteDaysPerWeek: 7 }).ok).toBe(false);
  });
  it("does not mistake negative numeric primitives for skipped values", () => {
    for (const field of ["annualMiles", "monthlyBudget", "children", "carSeats", "financePayment", "financeEndMonth"])
      expect(normalizeOnboarding({ [field]: -1 }).ok).toBe(false);
  });
  it("preserves explicit zero values and does not mutate raw input", () => {
    const input = { annualMiles: 0, children: 0, carSeats: 0, monthlyBudget: 0, financePayment: 0, financeType: "paid_off" };
    const before = structuredClone(input), result = normalizeOnboarding(input);
    expect(result.ok).toBe(true); expect(input).toEqual(before);
    if (result.ok) {
      expect(result.profile).toMatchObject({ annualMiles: 0, children: 0, carSeats: 0, monthlyBudget: 0 });
      expect(DriverProfileSchema.safeParse(applyDefaults(result.profile)).success).toBe(true);
    }
  });
});

describe("judge: VIN and coverage honesty", () => {
  it.each([null, undefined, 123, {}, [], "", "x".repeat(100000), "１２３４５６７８９０１２３４５６７", "1HGCM82633A00I352"])("never throws for malformed VIN input", vin => {
    expect(() => validateVin(vin as string)).not.toThrow();
    expect(validateVin(vin as string).ok).toBe(false);
  });
  it("rejects one-character VIN corruption at the check digit", () => {
    const vin = demoVins.camry.primary;
    expect(validateVin(vin, { checkDigit: true }).ok).toBe(true);
    for (const digit of "0123456789X") {
      if (digit === vin[8]) continue;
      expect(validateVin(vin.slice(0, 8) + digit + vin.slice(9), { checkDigit: true }).ok).toBe(false);
    }
  });
  it("keeps valid unknown VINs unsupported offline without any network access", async () => {
    const fetch = () => { throw new Error("Network forbidden"); };
    const result = await createVehicleIdentifier({ registry: {}, fetch })(demoVins.camry.primary, { offline: true });
    expect(result.status).toBe("unsupported");
  });
});

describe("judge: priority invariants", () => {
  it("keeps every combination and ordering finite, normalized and deterministic", () => {
    const pairs = ["cost_vs_cargo", "longevity_vs_fuel", "comfort_vs_cost"] as const;
    for (let mask = 0; mask < 27; mask++) {
      const picks = pairs.flatMap((pairId, i) => {
        const n = Math.floor(mask / 3 ** i) % 3;
        return n ? [{ pairId, choice: n === 1 ? "A" as const : "B" as const }] : [];
      });
      const before = structuredClone(picks), weights = mapTradeoffs(picks);
      expect(mapTradeoffs([...picks].reverse())).toEqual(weights);
      expect(picks).toEqual(before);
      expect(Object.values(weights).every(v => Number.isFinite(v) && v >= 0 && v <= 1)).toBe(true);
      expect(Object.values(weights).reduce((sum, v) => sum + v, 0)).toBeCloseTo(1, 10);
    }
  });
});
