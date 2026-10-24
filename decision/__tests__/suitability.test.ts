import { describe, expect, it } from "vitest";
import type { DriverProfile, SpecSheet } from "../../contracts";
import { SuitabilityResultSchema } from "../../contracts/schemas";
import { camry, camrySpec, rav4, rav4Spec, twin } from "../../sim/__tests__/fixtures";
import { assessSuitability, compareVehicles } from "../suitability";

const profile = (p: Partial<DriverProfile>): DriverProfile => ({ ...twin.driver, ...p });
const verified = (s: SpecSheet): SpecSheet => ({ ...s, verified: { carSeatFit: true, packingFit: true } });

describe("assessSuitability", () => {
  it("household of 2, low cargo: Camry is good", () => {
    const r = assessSuitability(profile({}), camry, camrySpec, 0);
    expect(r).toMatchObject({ passengerFit: "good", cargoFit: "good", constraints: [] });
    expect(SuitabilityResultSchema.safeParse(r).success).toBe(true);
  });

  it("two children in two car seats: Camry is still good when car seat fit is verified", () => {
    const r = assessSuitability(profile({ householdSize: 4, children: 2, carSeats: 2 }), camry, verified(camrySpec), 30);
    expect(r.passengerFit).toBe("good");
    expect(r.cargoFit).toBe("good"); // more kids does not mean more cargo unless the user said so
  });

  it("car seats without verified fit give needs_verification, never a guess", () => {
    const r = assessSuitability(profile({ householdSize: 3, children: 1, carSeats: 1 }), camry, camrySpec, 30);
    expect(r.passengerFit).toBe("needs_verification");
    expect(r.notes).toContain("car_seat_fit=unverified");
  });

  it("high cargo need: RAV4 fits better than Camry", () => {
    const p = profile({ cargoNeed: "high" });
    expect(assessSuitability(p, camry, camrySpec, 0).cargoFit).toBe("insufficient");
    expect(assessSuitability(p, rav4, rav4Spec, 0).cargoFit).toBe("good");
    expect(assessSuitability(profile({ cargoNeed: "medium" }), camry, camrySpec, 0).cargoFit).toBe("tight");
  });

  it("a household of 6: both insufficient with a hard constraint", () => {
    for (const [v, s] of [[camry, camrySpec], [rav4, rav4Spec]] as const) {
      const r = assessSuitability(profile({ householdSize: 6, children: 4 }), v, s, 0);
      expect(r.passengerFit).toBe("insufficient");
      expect(r.constraints).toContain("seats_below_household");
    }
  });

  it("three car seats fill the rear row (tight); four do not fit", () => {
    expect(assessSuitability(profile({ householdSize: 5, carSeats: 3 }), camry, verified(camrySpec), 0).passengerFit).toBe("tight");
    const r = assessSuitability(profile({ householdSize: 5, carSeats: 4 }), camry, verified(camrySpec), 0);
    expect(r.passengerFit).toBe("insufficient");
    expect(r.constraints).toContain("car_seats_exceed_rear_positions");
  });

  it("unreported cargo volume gives needs_verification", () => {
    expect(assessSuitability(profile({}), camry, { ...camrySpec, cargoCuFt: 0 }, 0).cargoFit).toBe("needs_verification");
  });

  it("notes are explanation-ready key=value pairs", () => {
    const r = assessSuitability(profile({ cargoNeed: "high" }), camry, { ...camrySpec, comfortScore: 0.7 }, 12);
    expect(r.notes).toEqual(expect.arrayContaining(["month=12", "cargo_need=high", "cargo_cu_ft=15", "packing_fit=unverified", "comfort_score=0.7"]));
    expect(r.notes.every(n => /^[a-z_]+=/.test(n))).toBe(true);
  });

  it("compareVehicles names the trade-off", () => {
    expect(compareVehicles(camrySpec, rav4Spec)).toEqual(["more_cargo_and_higher_mpg"]);
    expect(compareVehicles(camrySpec, { ...rav4Spec, mpgCombined: 28 })).toEqual(["more_cargo_but_lower_mpg"]);
    expect(compareVehicles(camrySpec, camrySpec)).toEqual(["same_cargo_and_mpg"]);
  });
});
