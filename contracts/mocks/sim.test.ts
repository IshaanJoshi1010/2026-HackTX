import { describe, expect, it } from "vitest";
import type { VehicleTwin } from "../index";
import * as S from "../schemas";
import {
  mockBreakEven, mockBreakEvenFound, mockBreakEvenNotFound, mockEvaluation, mockNextAction, mockScenarios,
  mockSensitivity, mockSimulationResult, mockSimulationResults,
} from "./sim";

// Local twin so these tests do not depend on /data fixtures.
const twin = {
  vehicle: {
    id: "camry-2022-se", make: "Toyota", model: "Camry", year: 2022, trim: "SE", powertrain: "gas", paint: "illustrative",
    mpg: 32, seats: 5, cargoCuFt: 15, msrp: 28000, modelAsset: "", matchStatus: "representative", specSources: ["illustrative"],
  },
  mileage: 48000, history: [],
  driver: {
    location: "Austin, TX", annualMiles: 12000, householdSize: 2, children: 0, carSeats: 0, cargoNeed: "low",
    fuelPricePerGal: 3, financeType: "loan", priorities: { cost: 0.2, family: 0.2, longevity: 0.2, fuel: 0.2, comfort: 0.2 },
    provenance: {},
  },
  finance: { financeType: "loan", balance: 15000, monthlyPayment: 450, remainingTermMonths: 36, provenance: {} },
} satisfies VehicleTwin;
const ctx = { vehicles: {}, specs: {} };
const results = mockScenarios.map(s => mockSimulationResults[s.id]);

describe("Dev 4 S0 sim mocks", () => {
  it("every scenario and simulation result passes its schema", () => {
    for (const s of mockScenarios) expect(S.ScenarioSchema.parse(s)).toEqual(s);
    for (const r of results) expect(S.SimulationResultSchema.parse(r)).toEqual(r);
  });

  it("has a baseline plus two branches with 60 monthly points each", () => {
    expect(mockScenarios.map(s => s.name)).toEqual(["Keep Camry", "Denver move", "Replace with RAV4 Hybrid"]);
    for (const r of results) {
      expect(r.points).toHaveLength(60);
      expect(r.points.map(p => p.month)).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
    }
  });

  it("mileage is monotonic per car and the replacement switches vehicle at month 12", () => {
    for (const r of results) {
      for (let i = 1; i < r.points.length; i++) {
        const [a, b] = [r.points[i - 1], r.points[i]];
        if (a.vehicleId === b.vehicleId) expect(b.mileage).toBeGreaterThan(a.mileage);
      }
    }
    const replace = mockSimulationResults["replace-rav4"].points;
    expect(replace[10].vehicleId).toBe("camry-2022-se");
    expect(replace[11].vehicleId).toBe("rav4-2024-hybrid-xle");
  });

  it("the Denver branch drives more and spends more on fuel than baseline", () => {
    const base = mockSimulationResults.baseline.points, denver = mockSimulationResults.denver.points;
    expect(denver[59].mileage).toBeGreaterThan(base[59].mileage);
    expect(denver[20].fuelSpend).toBeGreaterThan(base[20].fuelSpend);
    expect(denver.slice(0, 11)).toEqual(base.slice(0, 11)); // inherited history before the fork
  });

  it("net cost follows the accounting identity", () => {
    const start = { loan: 15000 };
    for (const r of results) {
      // value_0 is the month 0 car value; recover it from the first point.
      const p1 = r.points[0];
      const value0 = p1.vehicleValue + p1.netEconomicCost - p1.cumulativeCash - (p1.loanBalance - start.loan);
      for (const p of r.points) {
        expect(p.netEconomicCost).toBeCloseTo(p.cumulativeCash + (p.loanBalance - start.loan) - (p.vehicleValue - value0), 1);
      }
    }
  });

  it("simulate-compatible mock is deterministic and does not mutate input", () => {
    const before = structuredClone(mockScenarios[1]);
    expect(mockSimulationResult(twin, mockScenarios[1], ctx)).toEqual(mockSimulationResult(twin, mockScenarios[1], ctx));
    expect(mockScenarios[1]).toEqual(before);
  });

  it("evaluation, break-even, sensitivity and next action pass their schemas", () => {
    const evaluation = mockEvaluation({ twin, scenarios: mockScenarios, results, priorities: twin.driver.priorities });
    expect(S.DecisionEvaluationSchema.parse(evaluation)).toEqual(evaluation);
    expect(evaluation.sensitivity).toHaveLength(3);
    expect(evaluation.rationale.join(" ")).not.toMatch(/%/);
    for (const be of [mockBreakEvenFound, mockBreakEvenNotFound,
      mockBreakEven({ twin, keep: mockScenarios[1], replace: mockScenarios[2], parameter: "annualMiles", ctx, priorities: twin.driver.priorities }),
      mockBreakEven({ twin, keep: mockScenarios[1], replace: mockScenarios[2], parameter: "fuelPricePerGal", ctx, priorities: twin.driver.priorities }),
    ]) expect(S.BreakEvenResultSchema.parse(be)).toEqual(be);
    const sens = mockSensitivity({ twin, scenarios: mockScenarios, ctx, priorities: twin.driver.priorities });
    expect(S.SensitivityResultSchema.parse(sens)).toEqual(sens);
    expect(sens.totalCount).toBe(3);
    const action = mockNextAction(evaluation, twin, mockBreakEvenFound);
    expect(S.NextActionSchema.parse(action)).toEqual(action);
    expect(JSON.stringify(action)).not.toMatch(/booked|approved/i);
  });
});
