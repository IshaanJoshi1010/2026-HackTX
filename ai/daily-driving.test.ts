// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { deriveAnnualDriving } from "../data/drivingRate";
import { interpretOffline } from "./offline";
import { mapExtraction } from "./mapper";
import { createInterpreter } from "./interpret";
const today = "2026-10-24";
const exact = "im going to drive 100 miles a day next year in denver";
const ctx = { vehicle: { make: "Toyota", model: "Camry", year: 2022, trim: "SE" }, profile: { annualMiles: 12000 }, existingEvents: [], todayISO: today };
const extraction = (value: number | string, quote = exact) => ({ intent: "CREATE_SCENARIO", items: [{ field: "annualMiles", value, quote, month: "next year", certainty: "clear", assumptions: [] }] });

describe("daily driving screenshot regression", () => {
  it("creates an inferred month12 mileage proposal offline and does not invent a move to Denver", () => {
    const result = interpretOffline(exact, today);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ type: "mileage_change", month: 12, payload: { annualMiles: 36500 }, certainty: "inferred" });
    expect(result.events[0].assumptions.join(" ")).toContain("365 days/year");
    expect(result.events[0].assumptions.join(" ")).toContain("confirm");
  });
  it("maps literal daily units with code and never puts next year's value into today's profile", () => {
    const before = structuredClone(ctx);
    const mapped = mapExtraction(extraction("100 miles a day"), ctx, exact);
    expect(mapped.unresolved).toEqual([]);
    expect(mapped.result.aiAvailable && mapped.result.profilePatches).toEqual([]);
    expect(mapped.result.aiAvailable && mapped.result.proposals[0]).toMatchObject({ month: 12, payload: { annualMiles: 36500 }, certainty: "inferred", status: "proposed" });
    expect(ctx).toEqual(before);
  });
  it("ignores AI multiplication and derives the annual amount only from the literal daily quote", async () => {
    const generate = vi.fn().mockResolvedValue(JSON.stringify(extraction(36500)));
    const result = await createInterpreter(generate)(exact, ctx);
    expect(generate).toHaveBeenCalledOnce();
    expect(result.aiAvailable && result.proposals[0]).toMatchObject({ payload: { annualMiles: 36500 }, certainty: "inferred" });
    expect(result.aiAvailable && result.proposals[0].assumptions.join(" ")).toContain("365 days/year");
  });
  it.each(["100 miles per day", "100 mi/day", "100 miles daily", "100 miles each day", "100 miles every day"])("supports %s", rate => {
    expect(interpretOffline(`I will drive ${rate} next year.`, today).events[0]).toMatchObject({ month: 12, payload: { annualMiles: 36500 }, certainty: "inferred" });
  });
  it.each([["100 miles a day, 5 days a week", 26000], ["100 miles per day on weekdays", 26000], ["100 miles a day on weekends", 10400], ["0 miles a day", 0], ["12.5 miles a day", 4562.5]])("converts %s with explicit assumptions", (raw, annual) => {
    const quote = `I drive ${raw} next year`;
    expect(deriveAnnualDriving(String(raw), quote)?.annualMiles).toBe(annual);
    expect(interpretOffline(quote, today).events[0]?.payload.annualMiles).toBe(annual);
  });
  it.each([
    "I don't drive 100 miles a day next year", "Would I drive 100 miles a day next year?", "I might drive 100 miles a day next year",
    "I drive 100 miles a day for 10 days next year", "I drive 100 miles a day during summer next year",
    "I commute 100 miles a day next year", "I drive 100 miles a day 8 days a week next year",
    "I drive -100 miles a day next year", "I will drive 100 miles a day next year and 200 miles a day next year",
  ])("does not silently annualize ambiguous or unsupported driving: %s", prompt => {
    expect(interpretOffline(prompt, today).events).toEqual([]);
  });
  it("preserves independently dated daily changes instead of confusing them with a contradiction", () => {
    expect(interpretOffline("I drive 100 miles a day and 200 miles a day next year", today).events.map(e => [e.month, e.payload.annualMiles])).toEqual([[0, 36500], [12, 73000]]);
  });
  it("rejects model-inferred relocation from a driving place", () => {
    const mapped = mapExtraction({ intent: "CREATE_SCENARIO", items: [{ field: "location", value: "denver", quote: exact, month: "next year", certainty: "clear", assumptions: [] }] }, ctx, exact);
    expect(mapped.unresolved).toEqual([]);
    expect(mapped.result.aiAvailable && mapped.result.proposals).toEqual([]);
  });
  it("ignores a model's invented relocation without dropping the valid driving proposal", async () => {
    const output = extraction("100 miles a day");
    const raw = { ...output, items: [...output.items, { field: "location", value: "denver", quote: exact, month: "next year", certainty: "clear", assumptions: ["move inferred"] }] };
    const generate = vi.fn().mockResolvedValue(JSON.stringify(raw));
    const result = await createInterpreter(generate)(exact, ctx);
    expect(generate).toHaveBeenCalledOnce();
    expect(result.aiAvailable && result.proposals).toHaveLength(1);
    expect(result.aiAvailable && result.proposals[0]).toMatchObject({ type: "mileage_change", month: 12, payload: { annualMiles: 36500 } });
  });
  it("uses code-authored assumptions rather than contradictory AI arithmetic", () => {
    const quote = "I drive 100 miles a day, 5 days a week next year";
    const value = { intent: "CREATE_SCENARIO", items: [{ field: "annualMiles", value: "100 miles a day", quote, month: "next year", certainty: "clear", assumptions: ["Assume 365 days and 99999 annual miles"] }] };
    const result = mapExtraction(value, ctx, quote).result;
    expect(result.aiAvailable && result.proposals[0].payload.annualMiles).toBe(26000);
    expect(result.aiAvailable && result.proposals[0].assumptions.join(" ")).not.toContain("365");
    expect(result.aiAvailable && result.proposals[0].assumptions.join(" ")).not.toContain("99999");
  });
  it("does not accept an unquoted number or misinterpret money as daily miles", () => {
    expect(deriveAnnualDriving("200 miles a day", exact)).toBeNull();
    expect(deriveAnnualDriving("100 miles a day", "I spend $100 a day")).toBeNull();
    expect(deriveAnnualDriving("1000000000 miles a day", "1000000000 miles a day")).toBeNull();
  });
});
