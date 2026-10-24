import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountDataSchema, VehicleSignalsSchema } from "../../contracts/schemas";
import { createProvider, providerRegistry, getProviderDescriptor, SyntheticProvider, SimulatedSmartcarProvider, TFSProvider, loadProviderData, mapProviderData, ProviderNotConfiguredError } from "./index";
import { demoVins, getRegistryVehicles } from "../registry";
import { buildTwinWithDetails } from "../twin";
import { alexProfile } from "../fixtures/alex";
afterEach(() => vi.unstubAllGlobals());

describe("C6 offline connection providers", () => {
  it("defaults to Alex's synthetic account and the selected vehicle's synthetic odometer", async () => {
    const provider = createProvider();
    expect(provider).toBeInstanceOf(SyntheticProvider);
    const account = await provider.getAccount(), signals = await provider.getVehicleSignals();
    expect(AccountDataSchema.safeParse(account).success).toBe(true);
    expect(account.finance).toMatchObject({ financeType: "loan", balance: 15000, monthlyPayment: 450, remainingTermMonths: 36 });
    expect(Object.values(account.finance.provenance).every(source => source === "synthetic")).toBe(true);
    expect(signals).toEqual({ mileage: 48000, source: "synthetic" });
    expect(await createProvider({ vehicleId: "rav4-2024-hybrid-xle" }).getVehicleSignals()).toEqual({ mileage: 24000, source: "synthetic" });
  });
  it("swaps values and disclosure labels through the same interface without network access", async () => {
    const fetch = vi.fn(() => { throw new Error("Network disabled"); });
    vi.stubGlobal("fetch", fetch);
    const synthetic = createProvider({ id: "synthetic" }), simulated = createProvider({ id: "smartcar-simulated" });
    expect(simulated).toBeInstanceOf(SimulatedSmartcarProvider);
    const a = await synthetic.getAccount(), b = await simulated.getAccount();
    expect(Object.keys(a)).toEqual(Object.keys(b));
    expect(Object.keys(a.finance)).toEqual(Object.keys(b.finance));
    expect(a.finance.balance).not.toBe(b.finance.balance);
    expect((await synthetic.getVehicleSignals()).mileage).not.toBe((await simulated.getVehicleSignals()).mileage);
    expect(VehicleSignalsSchema.safeParse(await simulated.getVehicleSignals()).success).toBe(true);
    expect(b.source).toBe("synthetic");
    expect(Object.values(b.finance.provenance).every(source => source === "synthetic")).toBe(true);
    expect(getProviderDescriptor("synthetic").label).not.toBe(getProviderDescriptor("smartcar-simulated").label);
    expect(getProviderDescriptor("smartcar-simulated").disclosure).toContain("Not connected");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("returns stable values and independent objects", async () => {
    for (const provider of [new SyntheticProvider(), new SimulatedSmartcarProvider()]) {
      const before = await provider.getAccount(), changed = await provider.getAccount();
      changed.finance.balance = 0;
      changed.finance.provenance.balance = "user";
      expect(await provider.getAccount()).toEqual(before);
      const signals = await provider.getVehicleSignals(); signals.mileage = 1;
      expect((await provider.getVehicleSignals()).mileage).not.toBe(1);
    }
  });
  it("TFS always fails clearly and the factory never silently selects another provider", async () => {
    const tfs = createProvider({ id: "tfs" });
    expect(tfs).toBeInstanceOf(TFSProvider);
    await expect(tfs.getAccount()).rejects.toBeInstanceOf(ProviderNotConfiguredError);
    await expect(tfs.getVehicleSignals()).rejects.toThrow("not configured");
    const loaded = await loadProviderData(tfs);
    expect(loaded.ok).toBe(false);
    expect(!loaded.ok && loaded.error).toContain("not configured");
    expect(getProviderDescriptor("tfs").configured).toBe(false);
    expect(() => createProvider({ id: "unknown" } as never)).toThrow("Invalid");
    expect(() => createProvider({ vehicleId: "unknown" } as never)).toThrow("Invalid");
    expect(providerRegistry).toHaveLength(3);
  });
});

describe("provider mapping and twin integration", () => {
  it("maps profile finance and mileage provenance without mutating confirmed data", async () => {
    const before = structuredClone(alexProfile);
    const result = await loadProviderData(new SyntheticProvider(), alexProfile);
    if (!result.ok) throw new Error(result.error);
    expect(result.profile.financeType).toBe("loan");
    expect(result.profile.provenance.financeType).toBe("synthetic");
    expect(result.mileageSource).toBe("synthetic");
    expect(result.finance.provenance.balance).toBe("synthetic");
    result.profile.priorities.cost = 1;
    expect(alexProfile).toEqual(before);
  });
  it("rejects malformed provider responses, contradictions and private error strings", async () => {
    expect(mapProviderData({}, {}).ok).toBe(false);
    const provider = new SyntheticProvider();
    const conflict = await loadProviderData(provider, { financeType: "paid_off" });
    expect(conflict.ok).toBe(false);
    const failure = await loadProviderData({ getAccount: async () => { throw new Error("secret details"); }, getVehicleSignals: () => provider.getVehicleSignals() });
    expect(failure.ok).toBe(false);
    expect(JSON.stringify(failure)).not.toContain("secret details");
  });
  it("builds twins with either provider without changing UI call signatures", async () => {
    const configs = getRegistryVehicles();
    for (const [vehicleId, vin] of [["camry-2022-se", demoVins.camry.primary], ["rav4-2024-hybrid-xle", demoVins.rav4.primary]] as const) {
      const first = await buildTwinWithDetails({ vehicle: configs[vin], provider: createProvider({ vehicleId }) });
      const second = await buildTwinWithDetails({ vehicle: configs[vin], provider: createProvider({ id: "smartcar-simulated", vehicleId }) });
      if (!first.ok || !second.ok) throw new Error("Expected provider twins");
      expect(first.twin.finance.balance).not.toBe(second.twin.finance.balance);
      expect(first.twin.mileage).not.toBe(second.twin.mileage);
      expect(first.metadata.historyState).toBe("synthetic");
      expect(second.metadata.historyState).toBe("unavailable");
      expect(second.metadata.mileage.source).toBe("synthetic");
    }
    const failed = await buildTwinWithDetails({ vehicle: configs[demoVins.camry.primary], provider: new TFSProvider() });
    expect(failed.ok).toBe(false);
    expect(failed).not.toHaveProperty("twin");
    expect(!failed.ok && failed.error).toContain("not configured");
  });
});
