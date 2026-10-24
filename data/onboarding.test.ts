import { describe, expect, it } from "vitest";
import { normalizeProfile, normalizeOnboarding, mergeContradiction } from "./normalize";
import { applyDefaults, defaultsTable } from "./defaults";
import { mapTradeoffs } from "./tradeoffs";
import { gapCheck } from "./gapCheck";
import { resolveFinance } from "./finance";
import { DriverProfileSchema, QuestionSchema } from "../contracts/schemas";
import { alexProfile } from "./fixtures/alex";
import { buildTwin } from "./twin";
import { getRegistryVehicles, demoVins } from "./registry";
import type { TradeoffPick } from "../contracts";

describe("C5 normalization", () => {
  it.each([
    [{ commute: "30 miles each way, 4 days" }, { annualMiles: 16480, commuteMilesOneWay: 30, commuteDaysPerWeek: 4 }],
    [{ annualMiles: "like 20k a year" }, { annualMiles: 20000 }],
    [{ annualMiles: "no idea" }, {}],
    [{ annualMiles: "20,000 miles annually" }, { annualMiles: 20000 }],
    [{ annualMiles: "about 15k miles per year" }, { annualMiles: 15000 }],
    [{ monthlyBudget: "$500/month" }, { monthlyBudget: 500 }],
    [{ householdSize: "4 people" }, { householdSize: 4 }],
    [{ children: "2 kids" }, { children: 2 }],
    [{ financeType: "paid off" }, { financeType: "paid_off" }],
    [{ location: " Austin, TX " }, { location: "Austin, TX" }],
  ])("normalizes messy structured input %j", (input, expected) => {
    const result = normalizeProfile(input);
    if (!result.ok) throw new Error(result.error);
    expect(result.profile).toMatchObject(expected);
    expect(DriverProfileSchema.safeParse(applyDefaults(result.profile)).success).toBe(true);
  });
  it("labels annual commute totals estimated and never overwrites an explicit annual total", () => {
    const result = normalizeOnboarding({ commute: "30 miles each way, 4 days" });
    if (!result.ok) throw new Error(result.error);
    expect(result.profile.provenance?.annualMiles).toBe("estimated");
    expect(result.hints.notes.join(" ")).toContain("4,000 estimated");
    const explicit = normalizeProfile({ annualMiles: 20000, commute: "30 miles each way, 4 days" });
    expect(explicit.ok && explicit.profile.annualMiles).toBe(20000);
    expect(explicit.ok && explicit.profile.provenance?.annualMiles).toBe("user");
  });
  it("preserves sources, rejects nonsense, and never invents values for vague commutes", () => {
    for (const raw of [{ annualMiles: -1 }, { commute: "30 miles each way, 9 days" }, { commute: "15 or 30 miles" },
      { annualMiles: "15 or 20k" }, { children: 1.5 }, { priorities: { cost: 2 } }, { surprise: 4 },
      { annualMiles: Infinity }, { annualMiles: "4 people" }, { monthlyBudget: "20k miles" }, { financePayment: -100 }, { financeEndMonth: 2.5 }]) expect(normalizeProfile(raw).ok).toBe(false);
    const vague = normalizeOnboarding({ commute: "commute is gonna be way longer" });
    if (!vague.ok) throw new Error(vague.error);
    expect(vague.hints.vagueCommute).toBe(true);
    expect(vague.profile.commuteMilesOneWay).toBeUndefined();
    const synthetic = normalizeProfile({ annualMiles: 12000, provenance: { annualMiles: "synthetic" } });
    expect(synthetic.ok && synthetic.profile.provenance?.annualMiles).toBe("synthetic");
  });
  it("defaults only missing values, preserves zeroes, avoids mutating input and permits skipping all optional questions", () => {
    const input = { annualMiles: 0, children: 0, householdSize: 4, fuelPricePerGal: 0, provenance: { annualMiles: "user" as const } };
    const before = structuredClone(input);
    const result = applyDefaults(input);
    expect(result.annualMiles).toBe(0);
    expect(result.fuelPricePerGal).toBe(0);
    expect(result.cargoNeed).toBe("high");
    expect(result.provenance.cargoNeed).toBe("estimated");
    expect(input).toEqual(before);
    expect(DriverProfileSchema.safeParse(applyDefaults({})).success).toBe(true);
    expect(defaultsTable.fuelPricePerGal.source).toBe("illustrative");
    expect(defaultsTable.maintenance.upgradeQuestion).toBeNull();
    expect(() => applyDefaults({ annualMiles: -1 })).toThrow();
  });
  it("proposes contradictions without applying them", () => {
    const existing = { annualMiles: 12000 }, incoming = { annualMiles: 20000 };
    const result = mergeContradiction(existing, incoming);
    expect(result).toEqual({ oldValue: existing, newValue: incoming, needsConfirm: true });
    result.newValue.annualMiles = 1;
    expect(incoming.annualMiles).toBe(20000);
    expect(existing.annualMiles).toBe(12000);
  });
});

describe("deterministic one-question gap check", () => {
  it("uses the documented priority order and only impact-relevant context", () => {
    const p = applyDefaults({});
    const ctx = { view: "compare" as const, vagueCommute: true, budgetMentioned: true };
    expect(gapCheck(p, ctx).missing).toEqual(["financeType", "cargoNeed", "commuteMilesOneWay", "monthlyBudget"]);
    expect(gapCheck(p, ctx).question?.field).toBe("financeType");
    expect(gapCheck(p, { ...ctx, declined: ["financeType"] }).question?.field).toBe("cargoNeed");
    expect(gapCheck(p, { view: "keep" })).toEqual({ missing: [], question: null });
    expect(gapCheck(alexProfile, { view: "compare" }).question).toBeNull();
    expect(gapCheck(p, { view: "compare", declined: ["financeType", "cargoNeed"] }).question).toBeNull();
  });
  it("includes uncertainty options and completes partially specified commutes without inventing days", () => {
    const question = gapCheck(applyDefaults({}), { view: "compare" }).question;
    expect(QuestionSchema.safeParse(question).success).toBe(true);
    expect(question?.options).toContain("I'm not sure");
    const normalized = normalizeOnboarding({ commute: "30 miles each way" });
    if (!normalized.ok) throw new Error(normalized.error);
    expect(gapCheck(applyDefaults(normalized.profile), { view: "keep", ...normalized.hints }).question?.field).toBe("commuteDaysPerWeek");
  });
});

describe("priority mapping", () => {
  it("normalizes every combination of the three picks and is independent of presentation order", () => {
    const pairs = ["cost_vs_cargo", "longevity_vs_fuel", "comfort_vs_cost"] as const;
    for (let bits = 0; bits < 8; bits++) {
      const picks: TradeoffPick[] = pairs.map((pairId, i) => ({ pairId, choice: bits & (1 << i) ? "A" : "B" }));
      const weights = mapTradeoffs(picks);
      expect(Object.values(weights).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
      expect(Object.values(weights).every(v => v >= 0.05 && v <= 1)).toBe(true);
      expect(mapTradeoffs([...picks].reverse())).toEqual(weights);
    }
    expect(mapTradeoffs([{ pairId: "cost_vs_cargo", choice: "A" }])).toMatchObject({ cost: 0.3, family: 0.1 });
    expect(mapTradeoffs([])).toEqual({ cost: 0.2, family: 0.2, longevity: 0.2, fuel: 0.2, comfort: 0.2 });
    expect(() => mapTradeoffs([{ pairId: "cost_vs_cargo", choice: "A" }, { pairId: "cost_vs_cargo", choice: "B" }])).toThrow();
  });
});

describe("finance rules and twin integration", () => {
  const ctx = { price: 23000, vehicleYear: 2022, currentYear: 2026 };
  it("paid-off needs no further question, loan and lease request only the next relevant field", () => {
    const paid = resolveFinance(applyDefaults({ financeType: "paid_off" }), {}, ctx);
    expect(paid.finance).toMatchObject({ balance: 0, monthlyPayment: 0, remainingTermMonths: 0 });
    expect(paid.question).toBeNull();
    const loan = resolveFinance(applyDefaults({ financeType: "loan" }), {}, ctx);
    expect(loan.question?.field).toBe("financePayment");
    expect(loan.finance.monthlyPayment).toBeGreaterThan(0);
    expect(loan.finance.provenance.monthlyPayment).toBe("estimated");
    const lease = resolveFinance(applyDefaults({ financeType: "lease" }), { payment: 350 }, ctx);
    expect(lease.question?.field).toBe("financeEndMonth");
    expect(lease.finance.provenance.monthlyPayment).toBe("user");
    const knownLease = resolveFinance(applyDefaults({ financeType: "lease" }), { payment: 350, endMonth: 18 }, ctx);
    expect(knownLease.question).toBeNull();
    expect(knownLease.finance.leaseEndMonth).toBe(18);
    expect(resolveFinance(applyDefaults({}), {}, ctx).nextAction).toBe("get a payoff quote");
  });
  it("changes finance estimates with price and age and ignores stale paid-off finance questions", () => {
    const profile = applyDefaults({ financeType: "loan", cargoNeed: "low" });
    const first = resolveFinance(profile, {}, ctx);
    const higher = resolveFinance(profile, {}, { ...ctx, price: 46000 });
    expect(higher.finance.monthlyPayment).toBeGreaterThan(first.finance.monthlyPayment);
    const older = resolveFinance(profile, {}, { ...ctx, vehicleYear: 2020 });
    expect(older.finance.remainingTermMonths).toBeLessThan(first.finance.remainingTermMonths);
    expect(gapCheck(applyDefaults({ financeType: "paid_off", cargoNeed: "low" }), { view: "compare", financeQuestion: first.question }).question).toBeNull();
  });
  it("preserves an explicit unknown finance selection in a demo twin and flags the payoff action", async () => {
    const result = await buildTwin({ vehicle: getRegistryVehicles()[demoVins.camry.primary], raw: { financeType: "unknown" } });
    if (!result.ok) throw new Error(result.error);
    expect(result.twin.driver.financeType).toBe("unknown");
    expect(result.twin.vehicle.specSources).toContain("get a payoff quote");
  });
  it("builds a valid twin with messy commute, supplied finance payment, and deterministic profile weights", async () => {
    const result = await buildTwin({ vehicle: getRegistryVehicles()[demoVins.camry.primary], raw: {
      commute: "30 miles each way, 4 days", financeType: "loan", financePayment: "$450/month",
      tradeoffPicks: [{ pairId: "cost_vs_cargo", choice: "A" }],
    } });
    if (!result.ok) throw new Error(result.error);
    expect(result.twin.driver.annualMiles).toBe(16480);
    expect(result.twin.finance.monthlyPayment).toBe(450);
    expect(result.twin.finance.provenance.monthlyPayment).toBe("user");
    expect(result.twin.driver.priorities.cost).toBe(0.3);
  });
});
