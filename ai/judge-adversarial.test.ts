// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { interpretOffline } from "./offline";
import { createInterpreter } from "./interpret";
import { numberCheck } from "./numberCheck";
import { mapExtraction } from "./mapper";
import { prepareScenarioTerms, prepareManualEvent } from "./scenarioDraft";
import { createServiceGate } from "./serviceGate";
import { InterpretResultSchema } from "../contracts/schemas";
import type { InterpretContext } from "../contracts";
const context: InterpretContext = { vehicle: { make: "Toyota", model: "Camry", year: 2022, trim: "SE" }, profile: { annualMiles: 12000, children: 1 }, todayISO: "2026-10-24", existingEvents: [] };
const item = (value: number, quote = `I drive ${value} miles per year`) => ({ field: "annualMiles", value, quote, certainty: "clear", assumptions: [] });

describe("judge: natural-language traps", () => {
  it.each([
    "I don’t move to Denver next year.", "I won’t move to Denver next year.", "I wouldn’t move to Denver next year.",
    "I can’t move to Denver next year.", "My wife isn’t pregnant.", "My wife wasn’t pregnant.",
    "I am moving to Denver？", "I am moving to Denver؟", "I am n\u200bot moving to Denver.", "I canʼt move to Denver.", "I am moving to Denver next summer.", "I am moving to Denver in -2 months.",
    "I drive 12000 miles per year; I drive 20000 miles per year.",
  ])("does not stage an ambiguous or conflicting change: %s", prompt => {
    expect(interpretOffline(prompt, context.todayISO).events).toEqual([]);
  });
  it.each([0, 1, 500, 12000, 20000, 100000])("preserves stated yearly miles %s without changing context", miles => {
    const before = structuredClone(context);
    const reading = interpretOffline(`I drive ${miles} miles per year.`, context.todayISO);
    expect(reading.events[0].payload).toEqual({ annualMiles: miles });
    expect(context).toEqual(before);
  });
  it("rejects long input before extraction and produces deterministic drafts over repeated requests", () => {
    expect(interpretOffline("I drive 12000 miles per year.".repeat(1000), context.todayISO).events).toEqual([]);
    const prompt = "I am moving to Denver in six months.";
    const expected = interpretOffline(prompt, context.todayISO);
    expect(expected.events[0].month).toBe(6);
    for (let i = 0; i < 100; i++) expect(interpretOffline(prompt, context.todayISO)).toEqual(expected);
  });
});

describe("judge: untrusted model output", () => {
  it.each([
    "not JSON", "```json\n{}\n```", "null", "[]", '{"intent":"RUN_CODE","items":[]}',
    '{"intent":"CREATE_SCENARIO","items":[],"confirmed":true}',
    JSON.stringify({ intent: "CREATE_SCENARIO", items: [{ ...item(99999), quote: "I drive 12000 miles per year" }] }),
    JSON.stringify({ intent: "CREATE_SCENARIO", items: [{ ...item(12000), status: "confirmed" }] }),
  ])("retries malformed or invented model output at most once", async raw => {
    const generate = vi.fn().mockResolvedValue(raw);
    const result = await createInterpreter(generate)("I drive 12000 miles per year", context);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ aiAvailable: true, intent: "CLARIFY", proposals: [], profilePatches: [] });
    expect(InterpretResultSchema.safeParse(result).success).toBe(true);
  });
  it("bounds model response size and item count before accepting changes", async () => {
    for (const raw of ["x".repeat(64001), JSON.stringify({ intent: "CREATE_SCENARIO", items: Array.from({ length: 33 }, () => item(12000)) })]) {
      const generate = vi.fn().mockResolvedValue(raw);
      expect(await createInterpreter(generate)("I drive 12000 miles per year", context)).toMatchObject({ intent: "CLARIFY", proposals: [] });
      expect(generate).toHaveBeenCalledTimes(2);
    }
  });
  it.each([429, 500, 503, 504])("does not retry provider failure %s or expose its error", async status => {
    const generate = vi.fn().mockRejectedValue(Object.assign(new Error("PRIVATE_KEY_DO_NOT_EXPOSE"), { status }));
    const result = await createInterpreter(generate)("I drive 12000 miles per year", context);
    expect(result).toEqual({ aiAvailable: false });
    expect(generate).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain("PRIVATE_KEY");
  });
  it("does not call AI for an empty or oversized request", async () => {
    const generate = vi.fn();
    for (const prompt of ["", " ", "x".repeat(8001)]) {
      const result = await createInterpreter(generate)(prompt, context);
      expect(result).toMatchObject({ intent: "CLARIFY", proposals: [] });
    }
    expect(generate).not.toHaveBeenCalled();
  });
  it("withholds all changes when one item fails, rather than applying a partially trusted answer", async () => {
    const prompt = "I drive 12000 miles per year. My budget is $500/month.";
    const generate = vi.fn().mockResolvedValue(JSON.stringify({ intent: "CREATE_SCENARIO", items: [item(12000, prompt), { field: "monthlyBudget", value: 99999, quote: prompt, certainty: "clear", assumptions: [] }] }));
    expect(await createInterpreter(generate)(prompt, context)).toMatchObject({ intent: "CLARIFY", proposals: [], profilePatches: [] });
  });
  it("does not let finance patches bypass the same input magnitude limit", () => {
    const prompt = "My monthly payment is $1000000000000";
    const mapped = mapExtraction({ intent: "CREATE_SCENARIO", items: [{ field: "financePayment", value: 1000000000000, quote: prompt, certainty: "clear", assumptions: [] }] }, context, prompt);
    expect(mapped.unresolved).toHaveLength(1);
    expect(mapped.result.aiAvailable && mapped.result.profilePatches).toEqual([]);
  });
  it("keeps queries read-only even when a model returns extraneous updates", () => {
    for (const intent of ["COMPARE_SCENARIOS", "FIND_BREAK_EVEN", "RECOMMEND_ACTION", "EXPLAIN_RESULT"]) {
      const r = mapExtraction({ intent, items: [item(12000)] }, context, "I drive 12000 miles per year").result;
      expect(r.aiAvailable && r.proposals).toEqual([]);
      expect(r.aiAvailable && r.profilePatches).toEqual([]);
    }
  });
});

describe("judge: number laundering", () => {
  it.each(["Cost is $1e999", `Cost is $${"9".repeat(400)}`, "Cost is $1e308b", "Cost is .5", "Cost is Infinity", "Cost is NaN", "Cost is ∞", "Cost is ９９９９９", "Cost is ١٢٣٤", "Cost is 9\u200b9\u200b9", "Cost is ½", "Cost is Ⅳ"])("rejects an unsupported or invented numerical claim: %s", prose => {
    expect(numberCheck(prose, { supplied: [9, 1, 2, 12000] }).ok).toBe(false);
  });
  it("reads identifier hyphens as separators while preserving genuine negative amounts", () => {
    expect(numberCheck("The 2022 Camry and 2024 RAV4", { ids: ["camry-2022-se", "rav4-2024-hybrid-xle"] }).ok).toBe(true);
    expect(numberCheck("Cost is -500", { amount: 500 }).ok).toBe(false);
    expect(numberCheck("Cost is -500", { amount: -500 }).ok).toBe(true);
  });
  it("checks a leading decimal as a fraction rather than as a whole number", () => {
    expect(numberCheck("Cost is .5", { value: 0.5 }).ok).toBe(true);
  });
  it.each(["Cost is $12,000", "Cost is 12k", "Cost is twelve thousand", "Cost is １２，０００"])("retains legitimate supplied number formatting: %s", prose => {
    expect(numberCheck(prose, { supplied: 12000 }).ok).toBe(true);
  });
});

describe("judge: finance and event boundaries", () => {
  it.each(["insurancePerMonth", "replacementPrice", "downPayment", "purchaseFees", "salesTaxPercent", "newLoanAprPercent", "newLoanTermMonths", "loanAprPercent"])("treats explicit undefined as skipped: %s", field => {
    const draft = prepareScenarioTerms({ [field]: undefined });
    expect(draft.ok).toBe(true);
    expect(draft.ok && draft.assumptions).toEqual({});
    expect(draft.ok && draft.provenance).toEqual({});
  });
  it.each([Number.MAX_VALUE, Number.MAX_SAFE_INTEGER, NaN, Infinity, -Infinity, -1])("rejects unsafe financial and mileage input %s", value => {
    expect(prepareScenarioTerms({ insurancePerMonth: value }).ok).toBe(false);
    expect(prepareManualEvent({ type: "mileage_change", month: 0, annualMiles: value }).ok).toBe(false);
  });
  it.each([null, [], "500", { replacementPrice: "30000" }, { newLoanTermMonths: 60.5 }, { monthlyPayment: 500 }, JSON.parse('{"__proto__":{"polluted":true}}')])("rejects malformed finance structures", input => {
    expect(prepareScenarioTerms(input).ok).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it("produces only finite draft numbers and preserves inputs for 500 seeded examples", () => {
    let seed = 2026;
    const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    for (let i = 0; i < 500; i++) {
      const input = { replacementPrice: Math.round(rand() * 100000), downPayment: 0, insurancePerMonth: Math.round(rand() * 500), newLoanAprPercent: rand() * 30, salesTaxPercent: rand() * 15, newLoanTermMonths: 1 + Math.floor(rand() * 120) };
      const before = structuredClone(input), result = prepareScenarioTerms(input);
      expect(result.ok).toBe(true);
      if (result.ok) expect(Object.values(result.assumptions).every(Number.isFinite)).toBe(true);
      expect(input).toEqual(before);
    }
  });
});

describe("judge: bounded burst handling", () => {
  it("handles 10000 simultaneous admission attempts with at most two active calls and recovers", () => {
    let clock = 0;
    const gate = createServiceGate(() => clock);
    const permits = Array.from({ length: 10000 }, () => gate.acquire());
    const accepted = permits.filter(p => p.ok);
    expect(accepted).toHaveLength(2);
    expect(permits.filter(p => !p.ok)).toHaveLength(9998);
    accepted.forEach(p => { if (p.ok) p.release(); });
    clock = 60000;
    const recovered = gate.acquire(); expect(recovered.ok).toBe(true); if (recovered.ok) recovered.release();
  });
  it("never exceeds ten generation starts in a rolling minute even after releases", () => {
    let clock = 0; const gate = createServiceGate(() => clock);
    const accepted: number[] = [];
    for (let i = 0; i < 1000; i++) {
      clock += 100;
      const permit = gate.acquire();
      if (permit.ok) { accepted.push(clock); permit.release(); }
      expect(accepted.filter(t => clock - t < 60000).length).toBeLessThanOrEqual(10);
    }
  });
});
