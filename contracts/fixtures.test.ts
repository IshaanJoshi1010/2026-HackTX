import { describe, expect, it } from "vitest";
import { alexProfile } from "../data/fixtures/alex";
import { syntheticFinance } from "../data/fixtures/finance";
import { camryVehicle, rav4Vehicle, vehicleFixtures } from "../data/fixtures/vehicles";
import { specFixtures } from "../data/fixtures/specs";
import epa from "../data/fixtures/epa.json";
import { mockInterpret, mockQuestion, mockSpecs, mockTwin } from "./mocks";
import * as S from "./schemas";

const context = { vehicle: camryVehicle, profile: alexProfile, existingEvents: [], todayISO: "2026-10-24" };

describe("C0 offline fixture contracts", () => {
  it("validates every driver, finance, vehicle and spec fixture", () => {
    expect(S.DriverProfileSchema.parse(alexProfile)).toEqual(alexProfile);
    expect(S.FinanceStateSchema.parse(syntheticFinance)).toEqual(syntheticFinance);
    for (const vehicle of vehicleFixtures) expect(S.VehicleConfigSchema.parse(vehicle)).toEqual(vehicle);
    for (const spec of Object.values(specFixtures)) expect(S.SpecSheetSchema.parse(spec)).toEqual(spec);
  });
  it("requires normalized priority weights and provenance for every present driver field", () => {
    expect(Object.values(alexProfile.priorities).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    for (const field of Object.keys(alexProfile).filter(k => k !== "provenance")) {
      expect(alexProfile.provenance[field]).toBe("synthetic");
      const broken = structuredClone(alexProfile);
      delete broken.provenance[field];
      expect(S.DriverProfileSchema.safeParse(broken).success).toBe(false);
    }
    expect(S.DriverProfileSchema.safeParse({ ...alexProfile, priorities: { ...alexProfile.priorities, cost: 1 } }).success).toBe(false);
  });
  it("requires provenance for each finance field", () => {
    for (const field of Object.keys(syntheticFinance).filter(k => k !== "provenance")) {
      expect(syntheticFinance.provenance[field]).toBe("synthetic");
      const broken = structuredClone(syntheticFinance);
      delete broken.provenance[field];
      expect(S.FinanceStateSchema.safeParse(broken).success).toBe(false);
    }
  });
  it("uses EPA MPG for the correct drivetrain and labels unverified numbers", () => {
    expect(camryVehicle.mpg).toBe(Number(epa.records[0].comb08));
    expect(rav4Vehicle.mpg).toBe(Number(epa.records[2].comb08));
    for (const [i, vehicle] of vehicleFixtures.entries()) {
      const spec = specFixtures[vehicle.id];
      const record = epa.records[i === 0 ? 0 : 2];
      expect([spec.mpgCity, spec.mpgHwy, spec.mpgCombined]).toEqual([Number(record.city08), Number(record.highway08), Number(record.comb08)]);
      expect(vehicle.matchStatus).toBe("representative");
      expect(vehicle.vin).toBeUndefined();
      expect(vehicle.modelAsset).toBe("");
      expect(spec.verified).toEqual({ carSeatFit: false, packingFit: false });
      for (const [key, value] of Object.entries(spec)) {
        if (typeof value === "number") expect(spec.sources[key]).toBeDefined();
      }
      expect(spec.sources.cargoCuFt).toBe("illustrative");
      expect(spec).not.toHaveProperty("fuelCost08");
      expect(spec).not.toHaveProperty("youSaveSpend");
    }
    expect(specFixtures[rav4Vehicle.id].cargoCuFt).toBeGreaterThan(0);
  });
  it("returns readable nested validation errors without throwing", () => {
    const result = S.validate(S.DriverProfileSchema, { ...alexProfile, annualMiles: -1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("annualMiles");
    expect(S.validate(S.DriverProfileSchema, alexProfile)).toEqual({ ok: true, data: alexProfile });
  });
});

describe("C0 integration mocks", () => {
  it("builds schema-valid twins for either vehicle, respects mileage and isolates callers", async () => {
    for (const vehicle of vehicleFixtures) {
      const result = await mockTwin({ vehicle, mileage: 12345 });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(S.VehicleTwinSchema.safeParse(result.twin).success).toBe(true);
      expect(result.twin.mileage).toBe(12345);
      result.twin.driver.priorities.cost = 1;
      result.twin.vehicle.paint = "changed";
    }
    expect(alexProfile.priorities.cost).toBe(0.2);
    expect(camryVehicle.paint).toContain("TODO");
    expect((await mockTwin({ vehicle: camryVehicle, mileage: -1 })).ok).toBe(false);
    expect((await mockTwin({ vehicle: { ...camryVehicle, vin: "invalid" } })).ok).toBe(false);
  });
  it("keeps interpret offline and leaves confirmed input unchanged", async () => {
    const before = structuredClone(context);
    const result = await mockInterpret("move to Denver", context);
    expect(S.InterpretResultSchema.safeParse(result).success).toBe(true);
    expect(result).toEqual({ aiAvailable: false });
    expect(context).toEqual(before);
  });
  it("provides a valid question with an uncertainty option", () => {
    const result = mockQuestion(alexProfile, { view: "compare" });
    expect(S.QuestionSchema.safeParse(result.question).success).toBe(true);
    expect(result.question?.options).toContain("I'm not sure");
    expect(S.QuestionSchema.safeParse({ ...result.question, options: ["Low"] }).success).toBe(false);
  });
  it("returns independent spec copies and rejects unknown IDs", () => {
    const sheet = mockSpecs(camryVehicle.id);
    sheet.depreciation.retainedByYear[0] = 0;
    expect(mockSpecs(camryVehicle.id).depreciation.retainedByYear[0]).toBe(0.85);
    expect(() => mockSpecs("unknown")).toThrow("No mock specs");
    expect(() => mockSpecs("toString")).toThrow("No mock specs");
  });
});

describe("shared schema boundaries", () => {
  const proposal = { id: "event-1", type: "relocation", month: 12, payload: { location: "Denver" },
    source: "ai", assumptions: [], quote: "moving to Denver next year", certainty: "clear", status: "proposed" };
  it("accepts proposals but rejects already-confirmed AI or draft events", () => {
    const result = { aiAvailable: true, intent: "CREATE_SCENARIO", proposals: [proposal], profilePatches: [] };
    expect(S.InterpretResultSchema.safeParse(result).success).toBe(true);
    expect(S.InterpretResultSchema.safeParse({ ...result, proposals: [{ ...proposal, status: "confirmed" }] }).success).toBe(false);
    expect(S.ExploreStateSchema.safeParse({ confirmedProfile: alexProfile, draftChanges: [proposal], scenarios: [] }).success).toBe(true);
    expect(S.ExploreStateSchema.safeParse({ confirmedProfile: alexProfile, draftChanges: [{ ...proposal, status: "confirmed" }], scenarios: [] }).success).toBe(false);
  });
  it("validates provider methods and their returned data", async () => {
    const provider = S.ConnectionProviderSchema.parse({
      getAccount: async () => ({ finance: syntheticFinance, source: "synthetic" }),
      getVehicleSignals: async () => ({ mileage: 48000, source: "synthetic" }),
    });
    expect((await provider.getVehicleSignals()).mileage).toBe(48000);
    expect((await provider.getAccount()).finance).toEqual(syntheticFinance);
    const bad = S.ConnectionProviderSchema.parse({ getAccount: async () => ({}), getVehicleSignals: async () => ({ mileage: -1 }) });
    await expect(bad.getAccount()).rejects.toThrow();
    await expect(bad.getVehicleSignals()).rejects.toThrow();
  });
  it("covers remaining exported contract schemas with representative boundary values", () => {
    const fit = { passengerFit: "good", cargoFit: "needs_verification", tradeoffs: [], constraints: [], notes: [] };
    const point = { month: 0, vehicleId: camryVehicle.id, mileage: 48000, fuelSpend: 0, maintenanceSpend: 0,
      vehicleValue: 10000, loanBalance: 15000, cumulativeCash: 0, netEconomicCost: -1000, suitability: fit };
    const scenario = { id: "baseline", parentId: null, forkMonth: 0, name: "Baseline", events: [], assumptions: {} };
    const action = { label: "Keep", detail: "Review the comparison" };
    const samples: [import("zod").ZodType, unknown][] = [
      [S.HistoryRecordSchema, { date: "2026-10-24", type: "odometer", description: "Synthetic reading", mileage: 48000, source: "synthetic", provenance: "Fictional demo" }],
      [S.RawProfileInputSchema, { commute: "30 miles each way" }],
      [S.ScenarioSchema, scenario], [S.SuitabilityResultSchema, fit], [S.ProjectionPointSchema, point],
      [S.SimulationResultSchema, { scenarioId: "baseline", points: [point], milestones: [], warnings: [], summary: { totalCash: 0, netCost: -1000 } }],
      [S.DecisionEvaluationSchema, { scenarioIds: ["baseline"], hardConstraints: [], preferredScenarioId: "inconclusive", rationale: [], sensitivity: [], nextAction: action }],
      [S.TradeoffPickSchema, { pairId: "cost_vs_cargo", choice: "A" }],
      [S.ProfilePatchSchema, { field: "annualMiles", value: 20000, certainty: "clear", quote: "20k miles" }],
      [S.InterpretContextSchema, context],
      [S.IdentifyResultSchema, { status: "ok", vehicle: camryVehicle, decodeState: "registry" }],
      [S.IdentifyResultSchema, { status: "invalid", reason: "Invalid VIN" }],
      [S.IdentifyResultSchema, { status: "unsupported", partial: {}, reason: "Unknown model" }],
      [S.SimContextSchema, { vehicles: { [camryVehicle.id]: camryVehicle }, specs: specFixtures }],
      [S.MonthStateSchema, { month: 0, vehicleId: camryVehicle.id, annualMiles: 12000, householdSize: 2, children: 0, cargoNeed: "low", fuelPricePerGal: 3 }],
      [S.BreakEvenResultSchema, { found: false, parameter: "annualMiles", reason: "no_threshold_within_bounds", testedBounds: [0, 100000] }],
      [S.BreakEvenResultSchema, { found: true, parameter: "annualMiles", threshold: 20000, unit: "mi/yr", direction: "above", currentValue: 12000, testedBounds: [0, 100000] }],
      [S.SensitivityResultSchema, { runs: [{ label: "base", depreciation: 0.1, fuelPrice: 3, netCost: {} }], heldCount: 1, totalCount: 1, heldScenarioId: "inconclusive" }],
      [S.NextActionSchema, { ...action, factors: [] }],
    ];
    for (const [schema, input] of samples) expect(schema.safeParse(input).success).toBe(true);
    expect(S.LifeEventSchema.safeParse({ ...proposal, month: -1 }).success).toBe(false);
    expect(S.LifeEventSchema.safeParse({ ...proposal, month: 1.5 }).success).toBe(false);
    expect(S.DriverProfileSchema.safeParse({ ...alexProfile, annualMiles: Infinity }).success).toBe(false);
  });
});
