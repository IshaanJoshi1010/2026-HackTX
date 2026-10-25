import type { ConnectionProvider, DriverProfile, InterpretContext, InterpretResult, Question, RawProfileInput, SpecSheet, VehicleConfig, VehicleTwin } from "../index";
import { VehicleConfigSchema, VehicleTwinSchema, validate } from "../schemas";
import { alexProfile } from "../../data/fixtures/alex";
import { syntheticFinance } from "../../data/fixtures/finance";
import { specFixtures } from "../../data/fixtures/specs";

/** buildTwin-compatible offline mock. Raw input and provider integration arrive after C0. */
export async function mockTwin(a: { vehicle: VehicleConfig; mileage?: number; raw?: RawProfileInput; provider?: ConnectionProvider }):
Promise<{ ok: true; twin: VehicleTwin } | { ok: false; error: string }> {
  const vehicle = validate(VehicleConfigSchema, a.vehicle);
  if (!vehicle.ok) return { ok: false, error: vehicle.error };
  const driver = structuredClone(alexProfile);
  driver.provenance.mileage = a.mileage === undefined ? "synthetic" : "user";
  const result = validate(VehicleTwinSchema, {
    vehicle: structuredClone(vehicle.data), mileage: a.mileage ?? 48000, history: [],
    driver, finance: structuredClone(syntheticFinance),
  });
  return result.ok ? { ok: true, twin: result.data } : result;
}

/** interpret-compatible mock: no model, extraction, network, or confirmed mutations. */
export async function mockInterpret(_prompt: string, _ctx: InterpretContext): Promise<InterpretResult> {
  void _prompt;
  void _ctx;
  return { aiAvailable: false };
}

/** gapCheck-compatible mock: a stable integration question, not the real gap-check algorithm. */
export function mockQuestion(_p: DriverProfile, _ctx: { view: "keep" | "compare" }): { missing: Question["field"][]; question: Question | null } {
  void _p;
  void _ctx;
  return { missing: ["cargoNeed"], question: { field: "cargoNeed", text: "How much cargo space do you need?",
    kind: "chips", options: ["Low", "Medium", "High", "I'm not sure"],
    impactNote: "Mock: cargo needs affect the keep versus replace comparison." } };
}

/** getSpecs-compatible mock. Unknown IDs fail instead of silently returning the wrong car. */
export function mockSpecs(vehicleId: string): SpecSheet {
  if (!Object.hasOwn(specFixtures, vehicleId)) throw new Error(`No mock specs for ${vehicleId}`);
  return structuredClone(specFixtures[vehicleId]);
}
