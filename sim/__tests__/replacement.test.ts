import { describe, expect, it } from "vitest";
import type { SimContext, SpecSheet, VehicleTwin } from "../../contracts";
import { SimulationResultSchema } from "../../contracts/schemas";
import { economicViews, purchaseTerms, taxAndFees } from "../replacement";
import { simulate, simulateDetailed } from "../simulate";
import { camry, camrySpec, ctx, ev, paidOffTwin, rav4, rav4Spec, twin, withEvents } from "./fixtures";

// Hand-calculable setup: no maintenance, no insurance, Camry 25 mpg, RAV4 40 mpg, $3/gal, 1,000 mi/month.
const plain = (s: SpecSheet, mpg: number): SpecSheet => ({ ...s, maintenance: [], mpgCombined: mpg });
const handCtx: SimContext = { ...ctx, specs: { [camry.id]: plain(camrySpec, 25), [rav4.id]: plain(rav4Spec, 40) } };
const terms = { insurancePerMonth: 0, replacementPrice: 30000, salesTaxRate: 0.05, purchaseFees: 500, downPayment: 5000, newLoanApr: 0, newLoanTermMonths: 60 };
const keep = withEvents([], { insurancePerMonth: 0 });
const replaceAt13 = (extra: Record<string, number> = {}, t: VehicleTwin = paidOffTwin) =>
  simulate(t, withEvents([ev("r", "vehicle_replacement", 13, { vehicleId: rav4.id })], { ...terms, ...extra }), handCtx);
const identityHolds = (r: ReturnType<typeof simulate>, value0: number, loan0: number) => {
  for (const p of r.points) expect(p.netEconomicCost).toBeCloseTo(p.cumulativeCash + (p.loanBalance - loan0) - (p.vehicleValue - value0), 6);
};
const camryValue0 = 28000 * 0.6;

describe("replacement economics", () => {
  it("keep: hand-calculated cash is 60 months of fuel", () => {
    const r = simulate(paidOffTwin, keep, handCtx);
    expect(r.summary.totalCash).toBeCloseTo(60 * 120, 6);
    expect(r.summary.netCost).toBeCloseTo(7200 - (r.points[59].vehicleValue - camryValue0), 6);
  });

  it("replace at month 13: hand-calculated cash, loan and net cost", () => {
    const k = simulate(paidOffTwin, keep, handCtx);
    const r = replaceAt13();
    const v12 = k.points[11].vehicleValue; // trade-in value: identical history through month 12
    expect(r.points.slice(0, 12)).toEqual(k.points.slice(0, 12));
    expect(r.points[12].vehicleId).toBe(rav4.id);
    // 12 x $120 Camry fuel - trade-in + $5,000 down + $2,000 tax and fees + 48 x $75 RAV4 fuel + 48 x $416.67 loan
    expect(r.summary.totalCash).toBeCloseTo(1440 - v12 + 5000 + 2000 + 48 * 75 + 48 * 25000 / 60, 6);
    expect(r.points[59].loanBalance).toBeCloseTo(25000 - 48 * 25000 / 60, 6);
    identityHolds(r, camryValue0, 0);
    expect(SimulationResultSchema.safeParse(r).success).toBe(true);
  });

  it("buying at price P, fees F, down D, rest financed costs exactly F at the instant of purchase", () => {
    // Freeze everything else: no driving, a RAV4 that never depreciates, 0% APR.
    const flat: SimContext = { ...handCtx, specs: { ...handCtx.specs, [rav4.id]: { ...handCtx.specs[rav4.id], depreciation: { retainedByYear: [1, 1, 1, 1, 1], mileageAdjPer10k: 0 } } } };
    const still = { ...paidOffTwin, driver: { ...paidOffTwin.driver, annualMiles: 0 } };
    const r = simulate(still, withEvents([ev("r", "vehicle_replacement", 13, { vehicleId: rav4.id })], terms), flat);
    const k = simulate(still, keep, flat);
    const camryDrop = k.points[12].netEconomicCost - k.points[11].netEconomicCost; // the Camry's own month-13 aging, avoided by selling
    expect(r.points[12].netEconomicCost - r.points[11].netEconomicCost).toBeCloseTo(30000 * 0.05 + 500, 6);
    expect(camryDrop).toBeGreaterThan(0);
  });

  it("raising the RAV4 price raises cash by the price plus tax delta, and net cost by that minus the value change", () => {
    const cashBuy = { downPayment: 1e9 }; // down payment caps at price: a cash purchase
    const a = replaceAt13(cashBuy), b = replaceAt13({ ...cashBuy, replacementPrice: 31000 });
    expect(b.summary.totalCash - a.summary.totalCash).toBeCloseTo(1000 * 1.05, 6);
    const dValue = b.points[59].vehicleValue - a.points[59].vehicleValue;
    expect(dValue).toBeCloseTo(1000 * a.points[59].vehicleValue / 30000, 6); // value is anchored to price
    expect(b.summary.netCost - a.summary.netCost).toBeCloseTo(1050 - dValue, 6);
    // At 0% APR, financing does not change net cost: principal nets out.
    expect(replaceAt13().summary.netCost).toBeCloseTo(a.summary.netCost, 6);
  });

  it("a paid-off car has zero payoff at trade-in", () => {
    const d = simulateDetailed(paidOffTwin, withEvents([ev("r", "vehicle_replacement", 13, { vehicleId: rav4.id })], terms), handCtx);
    const sale = d.result.milestones.find(m => m.includes("trade in"))!;
    expect(sale).not.toContain("pay off");
    expect(d.result.warnings.join(" ")).not.toContain("negative equity");
  });

  it("negative equity is paid at trade-in and the identity still holds", () => {
    const underwater: VehicleTwin = { ...twin, finance: { ...twin.finance, balance: 30000, monthlyPayment: 600, remainingTermMonths: 60 } };
    const r = replaceAt13({}, underwater);
    expect(r.warnings.some(w => w.includes("negative equity"))).toBe(true);
    expect(r.points[12].loanBalance).toBeCloseTo(25000 - 25000 / 60, 6); // only the new loan remains
    identityHolds(r, camryValue0, 30000);
  });

  it("defaults the price to the modeled market value, labeled estimated, and honors a listing price from the event", () => {
    const est = simulateDetailed(paidOffTwin, withEvents([ev("r", "vehicle_replacement", 12, { vehicleId: rav4.id })]), ctx);
    expect(est.assumptions.find(a => a.key === "replacement.price")).toMatchObject({ source: "estimated" });
    const listed = simulateDetailed(paidOffTwin, withEvents([ev("r", "vehicle_replacement", 12, { vehicleId: rav4.id, price: 32995, mileage: 24000 })]), ctx);
    expect(listed.assumptions.find(a => a.key === "replacement.price")).toMatchObject({ value: 32995, source: "user" });
    expect(listed.result.points[11].vehicleValue).toBeLessThan(32995);
    expect(listed.result.points[11].mileage).toBeCloseTo(25000);
    expect(listed.result.milestones).toContain(`Month 12: buy the 2024 RAV4 Hybrid XLE for $32,995 plus $${Math.round(32995 * 0.0625 + 450).toLocaleString("en-US")} tax and fees`);
  });

  it("uses the new car's mpg and maintenance after the swap", () => {
    const r = simulate(paidOffTwin, withEvents([ev("r", "vehicle_replacement", 13, { vehicleId: rav4.id })], terms), handCtx);
    expect(r.points[11].fuelSpend).toBeCloseTo(120);
    expect(r.points[12].fuelSpend).toBeCloseTo(75);
  });

  it("an unknown replacement vehicle is reported, not guessed", () => {
    const r = simulate(paidOffTwin, withEvents([ev("r", "vehicle_replacement", 13, { vehicleId: "mystery-car" })]), ctx);
    expect(r.points.every(p => p.vehicleId === camry.id)).toBe(true);
    expect(r.warnings).toContain("Vehicle mystery-car is not in the simulation context; the replacement is not modeled");
  });

  it("keeps the three views separate", () => {
    const v = economicViews(replaceAt13());
    expect(Object.keys(v)).toEqual(["cash", "position", "net"]);
    expect(v.cash).toHaveLength(60);
    expect(Object.keys(v.position[0])).toEqual(["month", "vehicleId", "vehicleValue", "loanBalance"]);
  });

  it("purchase terms take user overrides and label them", () => {
    const t = purchaseTerms({ salesTaxRate: 0.08 }, undefined, 25000, "estimated");
    expect(t.sources).toMatchObject({ price: "estimated", salesTaxRate: "user", fees: "illustrative" });
    expect(taxAndFees(t)).toBeCloseTo(25000 * 0.08 + 450);
    expect(t.downPayment).toBeCloseTo(2500);
  });
});
