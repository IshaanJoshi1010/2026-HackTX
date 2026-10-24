import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConnectionProvider } from "../contracts";
import { VehicleTwinSchema } from "../contracts/schemas";
import { buildTwin, buildTwinWithDetails, createTwinBuilder } from "./twin";
import { identifyVehicle } from "./decode";
import { demoVins, getRegistryVehicles } from "./registry";
import { camryVehicle } from "./fixtures/vehicles";
import { syntheticFinance } from "./fixtures/finance";
import { getHistory } from "./history";
import { prepareTwinProfile } from "./twin-profile";
const saved = () => getRegistryVehicles()[demoVins.camry.primary];
const provider = (): ConnectionProvider => ({
  getAccount: vi.fn(async () => ({ finance: structuredClone(syntheticFinance), source: "synthetic" as const })),
  getVehicleSignals: vi.fn(async () => ({ mileage: 49000, source: "synthetic" as const })),
});
afterEach(() => vi.unstubAllGlobals());

describe("C7 twin builder paths", () => {
  it("builds both primary and backup sample VINs offline with synthetic listing mileage", async () => {
    const fetch = vi.fn(() => { throw new Error("Offline"); });
    vi.stubGlobal("fetch", fetch);
    for (const pair of Object.values(demoVins)) for (const vin of [pair.primary, pair.backup]) {
      const identified = await identifyVehicle(vin, { offline: true });
      if (identified.status !== "ok") throw new Error("Expected sample registry hit");
      const result = await buildTwinWithDetails({ vehicle: identified.vehicle });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(VehicleTwinSchema.safeParse(result.twin).success).toBe(true);
      expect(result.metadata.mileage.source).toBe("synthetic");
      expect(result.twin.mileage).toBe(vin === demoVins.camry.primary ? 48000 : vin === demoVins.camry.backup ? 52000 : vin === demoVins.rav4.primary ? 24000 : 28000);
      expect(result.twin.driver.financeType).toBe("loan");
      expect(result.twin.finance.provenance.balance).toBe("synthetic");
      expect(result.metadata.historyState).toBe(vin === pair.primary ? "synthetic" : "unavailable");
      if (result.twin.history.length) expect(result.twin.history.at(-1)?.mileage).toBe(result.twin.mileage);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it("supports model/year/trim picker configs with explicit mileage and structured inputs", async () => {
    const result = await buildTwin({ vehicle: camryVehicle, mileage: 10000, raw: { location: "Denver, CO", annualMiles: 20000, householdSize: 4, financeType: "paid_off" } });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.twin.driver).toMatchObject({ annualMiles: 20000, cargoNeed: "high", financeType: "paid_off" });
    expect(result.twin.driver.provenance.annualMiles).toBe("user");
    expect(result.twin.finance.balance).toBe(0);
    expect(result.twin.vehicle.matchStatus).toBe("representative");
    expect(result.twin.history).toEqual([]);
    expect(result.twin.vehicle.specSources).toContain("history: no history available");
  });
  it("accepts a complete custom decoded vehicle but never returns exact for an unsupported model", async () => {
    const result = await buildTwin({ vehicle: { ...camryVehicle, vin: "1M8GDM9AXKP042788", make: "Other", model: "Other", matchStatus: "exact" }, mileage: 1000 });
    if (!result.ok) throw new Error(result.error);
    expect(result.twin.vehicle.matchStatus).toBe("unsupported");
    expect(result.twin.history).toEqual([]);
    expect(result.twin.driver.financeType).toBe("unknown");
    expect(result.twin.finance.provenance.balance).toBe("estimated");
  });
  it("rejects invalid VINs, partial configs and missing custom-vehicle mileage without a half-built twin", async () => {
    const inputs = [
      { vehicle: { ...saved(), vin: "INVALID" }, mileage: 100 },
      { vehicle: { vin: "1M8GDM9AXKP042788" } },
      { vehicle: camryVehicle },
      { vehicle: { ...saved(), model: "Corolla" }, mileage: 100 },
    ];
    for (const input of inputs) {
      const result = await buildTwin(input as Parameters<typeof buildTwin>[0]);
      expect(result.ok).toBe(false);
      expect(result).not.toHaveProperty("twin");
    }
  });
  it.each([-1, NaN, Infinity])("rejects invalid mileage %s", async mileage => {
    expect((await buildTwin({ vehicle: saved(), mileage })).ok).toBe(false);
  });
});

describe("C7 precedence and providers", () => {
  it("uses explicit mileage before provider signals, and signals before listing mileage", async () => {
    const p = provider();
    const explicit = await buildTwinWithDetails({ vehicle: saved(), mileage: 47000, provider: p });
    expect(explicit.ok && explicit.twin.mileage).toBe(47000);
    expect(explicit.ok && explicit.metadata.mileage.source).toBe("user");
    expect(p.getVehicleSignals).not.toHaveBeenCalled();
    const connected = await buildTwinWithDetails({ vehicle: saved(), provider: p });
    expect(connected.ok && connected.twin.mileage).toBe(49000);
    expect(connected.ok && connected.metadata.historyState).toBe("unavailable");
  });
  it("returns typed errors for failing providers, invalid account data or profile/account conflicts", async () => {
    const broken = provider();
    broken.getAccount = async () => { throw new Error("secret provider failure"); };
    const result = await buildTwin({ vehicle: saved(), provider: broken });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("secret");
    const badSignals = provider();
    badSignals.getVehicleSignals = async () => ({ mileage: -1, source: "synthetic" });
    expect((await buildTwin({ vehicle: saved(), provider: badSignals })).ok).toBe(false);
    expect((await buildTwin({ vehicle: saved(), provider: provider(), raw: { financeType: "paid_off" } })).ok).toBe(false);
  });
  it("does not mutate input configs, provider finance, profile inputs or seeded history", async () => {
    const vehicle = saved(), raw = { annualMiles: 20000 };
    const before = structuredClone({ vehicle, raw, syntheticFinance });
    const result = await buildTwin({ vehicle, raw });
    if (!result.ok) throw new Error(result.error);
    result.twin.history[0].mileage = 999;
    result.twin.finance.balance = 1;
    result.twin.driver.priorities.cost = 1;
    expect({ vehicle, raw, syntheticFinance }).toEqual(before);
    expect(getHistory(vehicle.id)[0].mileage).toBe(0);
  });
  it("rejects inconsistent dependency history", async () => {
    const builder = createTwinBuilder({ getHistory: () => [{ date: "2026-10-24", type: "odometer", description: "test", mileage: 48000, source: "user", provenance: "test" }] });
    expect((await builder({ vehicle: saved() })).ok).toBe(false);
  });
});

describe("C5 profile adapter", () => {
  it("labels defaults, preserves user data and rejects nonsense rather than guessing", () => {
    const result = prepareTwinProfile({ annualMiles: 20000, children: 2, provenance: { children: "synthetic" } });
    if (!result.ok) throw new Error(result.error);
    expect(result.profile.provenance.annualMiles).toBe("user");
    expect(result.profile.provenance.children).toBe("synthetic");
    expect(result.profile.provenance.fuelPricePerGal).toBe("illustrative");
    expect(prepareTwinProfile({ annualMiles: "like 20k a year" }).ok).toBe(true);
    expect(prepareTwinProfile({ commute: "30 miles each way" }).ok).toBe(true);
    expect(prepareTwinProfile({ children: -1 }).ok).toBe(false);
    expect(prepareTwinProfile({ priorities: { cost: 1, family: 1 } }).ok).toBe(false);
  });
});
