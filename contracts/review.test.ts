import { describe, expect, it } from "vitest";
import { LifeEventSchema, ScenarioSchema, HistoryRecordSchema, AccountDataSchema, VehicleSignalsSchema } from "./schemas";
import { mockTwin } from "./mocks";
import { camryVehicle } from "../data/fixtures/vehicles";
import { syntheticFinance } from "../data/fixtures/finance";
import { buildTwinWithDetails } from "../data/twin";
import { demoVins, getRegistryVehicles } from "../data/registry";
import { createProvider } from "../data/providers";
import { auditTwinSources } from "../data/audit";

describe("reviewed contract decisions", () => {
  it("keeps scenario time nonnegative and ownership history in ISO calendar dates", () => {
    const event = { id: "test", type: "family_change", month: 0, payload: { children: 2 }, source: "fixture", assumptions: [], certainty: "clear", status: "proposed" };
    expect(LifeEventSchema.safeParse(event).success).toBe(true);
    expect(LifeEventSchema.safeParse({ ...event, month: -1 }).success).toBe(false);
    expect(ScenarioSchema.safeParse({ id: "s", parentId: null, forkMonth: -1, name: "test", events: [], assumptions: {} }).success).toBe(false);
    const history = { date: "2026-10-24", type: "odometer", description: "Synthetic reading", mileage: 48000, source: "synthetic", provenance: "Fictional demo record" };
    expect(HistoryRecordSchema.safeParse(history).success).toBe(true);
    expect(HistoryRecordSchema.safeParse({ ...history, date: "10/24/2026" }).success).toBe(false);
  });

  it("validates the current finance/account/signals shapes without adding undocumented fields", () => {
    expect(AccountDataSchema.safeParse({ finance: syntheticFinance, source: "synthetic" }).success).toBe(true);
    expect(VehicleSignalsSchema.safeParse({ mileage: 48000, source: "synthetic" }).success).toBe(true);
    expect(AccountDataSchema.safeParse({ finance: { ...syntheticFinance, balance: -1 }, source: "synthetic" }).success).toBe(false);
    expect(VehicleSignalsSchema.safeParse({ mileage: -1, source: "synthetic" }).success).toBe(false);
  });

  it("stores actual odometer provenance in the agreed driver record for both builders", async () => {
    const vehicle = getRegistryVehicles()[demoVins.camry.primary];
    for (const input of [
      { vehicle },
      { vehicle, provider: createProvider() },
      { vehicle, mileage: 12345, raw: { provenance: { mileage: "synthetic" } } },
    ]) {
      const result = await buildTwinWithDetails(input);
      if (!result.ok) throw new Error(result.error);
      expect(result.twin.driver.provenance.mileage).toBe(input.mileage === undefined ? "synthetic" : "user");
      expect(auditTwinSources(result.twin, result.metadata).missing).toEqual([]);
      result.twin.driver.provenance.mileage = "illustrative";
      expect(auditTwinSources(result.twin, result.metadata).missing).toContain("mileage");
    }
    const defaultMock = await mockTwin({ vehicle: camryVehicle });
    const userMock = await mockTwin({ vehicle: camryVehicle, mileage: 12345 });
    expect(defaultMock.ok && defaultMock.twin.driver.provenance.mileage).toBe("synthetic");
    expect(userMock.ok && userMock.twin.driver.provenance.mileage).toBe("user");
  });
});
