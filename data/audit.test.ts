import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { identifyVehicle, createVehicleIdentifier } from "./decode";
import { buildTwin, buildTwinWithDetails } from "./twin";
import { getRegistryEntries, getRegistryEntry, getRegistryVehicles, demoVins } from "./registry";
import { getSpecDetails } from "./specs";
import { auditTwinSources } from "./audit";
import { createProvider } from "./providers";
import { alexProfile } from "./fixtures/alex";
import { VehicleTwinSchema } from "../contracts/schemas";
function numericLeaves(value: unknown, prefix = ""): string[] {
  if (typeof value === "number") return [prefix];
  return value && typeof value === "object" ? Object.entries(value).flatMap(([key, child]) => numericLeaves(child, prefix ? `${prefix}.${key}` : key)) : [];
}
afterEach(() => vi.unstubAllGlobals());

describe("C9 independent data audit", () => {
  it("audits both primary twins and every numeric spec leaf with network disabled", async () => {
    const fetch = vi.fn(() => { throw new Error("C9: network disabled"); });
    vi.stubGlobal("fetch", fetch);
    const summary = [];
    for (const vin of [demoVins.camry.primary, demoVins.rav4.primary]) {
      const identified = await identifyVehicle(vin, { offline: true });
      if (identified.status !== "ok") throw new Error("Primary identification failed");
      const result = await buildTwinWithDetails({ vehicle: identified.vehicle, raw: { ...alexProfile }, provider: createProvider({ vehicleId: vin === demoVins.camry.primary ? "camry-2022-se" : "rav4-2024-hybrid-xle" }) });
      if (!result.ok) throw new Error(result.error);
      const snapshot = getRegistryEntry(vin)!.listingSnapshot;
      expect(VehicleTwinSchema.safeParse(result.twin).success).toBe(true);
      expect(result.twin.vehicle).toMatchObject({ year: snapshot.fields.year, trim: snapshot.fields.trim, paint: snapshot.fields.paint });
      if (!result.twin.vehicle.modelAsset) expect(result.twin.vehicle.matchStatus).toBe("representative");
      if (result.twin.vehicle.matchStatus === "exact") expect(existsSync(join(process.cwd(), "public", result.twin.vehicle.modelAsset))).toBe(true);
      const sources = auditTwinSources(result.twin, result.metadata);
      expect(sources.missing).toEqual([]);
      const details = getSpecDetails(result.twin.vehicle.id), paths = numericLeaves(details.sheet);
      for (const path of paths) {
        expect(details.numericSources[path]?.source).toBeTruthy();
        expect(details.numericSources[path]?.label).toBe(details.sheet.sources[path.split(".")[0]]);
      }
      const changed = structuredClone(result.twin); changed.vehicle.paint = "Unknown paint";
      expect(auditTwinSources(changed, result.metadata).missing).toContain("vehicle.paint");
      summary.push({ vehicleId: result.twin.vehicle.id, vin, mileage: result.twin.mileage, historyRecords: result.twin.history.length,
        labeledTwinFields: sources.labeled, missingSources: sources.missing, numericSpecFields: paths.length,
        sourceLabels: [...new Set(Object.values(sources.fields))], assetStatus: "MISSING: representative fallback only" });
    }
    expect(fetch).not.toHaveBeenCalled();
    if (process.env.C9_REPORT === "1") console.log("C9_AUDIT_JSON=" + JSON.stringify(summary));
  });
  it("matches all saved JSON snapshot fields and declares the absence of external screenshots/assets", () => {
    for (const entry of getRegistryEntries()) {
      const stored = JSON.parse(readFileSync(join(process.cwd(), "data/listings", entry.listingSnapshot.id + ".json"), "utf8"));
      expect(entry.listingSnapshot).toEqual(stored);
      for (const key of ["vin", "make", "model", "year", "trim", "powertrain", "paint", "paintCode", "paintHex"] as const) expect(entry[key]).toBe(stored.fields[key]);
      expect(entry.id).toBe(stored.fields.vehicleId);
      expect(getSpecDetails(entry.id).drive).toBe(stored.fields.drive);
      expect(entry.fieldSources.vin).toBe("synthetic");
      expect(entry.specSources.join(" ")).toContain(entry.listingSnapshot.id);
    }
    const images = readdirSync(join(process.cwd(), "data/listings")).filter(name => /\.(?:png|jpe?g|webp)$/i.test(name));
    // Inventory is reported rather than treating future addition of team assets as a regression.
    if (process.env.C9_REPORT === "1") console.log("C9_INVENTORY_JSON=" + JSON.stringify({ listingScreenshots: images,
      assetManifestPresent: existsSync(join(process.cwd(), "public/models/manifest.json")) }));
  });
  it("keeps invalid/unsupported paths honest and rejects partial or invalid vehicles", async () => {
    const invalid = await identifyVehicle("INVALID", { offline: true });
    expect(invalid.status).toBe("invalid");
    expect((await buildTwin({ vehicle: { ...getRegistryVehicles()[demoVins.camry.primary], vin: "INVALID" } })).ok).toBe(false);
    const unknown = await identifyVehicle("1M8GDM9AXKP042788", { offline: true });
    expect(unknown.status).toBe("unsupported");
    const unsupported = await createVehicleIdentifier({ fetch: async () => ({ ok: true, status: 200, json: async () => ({ Results: [{ VIN: "1M8GDM9AXKP042788", Make: "Other", Model: "Other", ModelYear: "2022", ErrorCode: "0" }] }) }) })("1M8GDM9AXKP042788");
    expect(unsupported.status === "unsupported" && unsupported.partial.matchStatus).toBe("unsupported");
    if (unsupported.status !== "unsupported") throw new Error("Expected partial");
    expect((await buildTwin({ vehicle: unsupported.partial as never, mileage: 1000 })).ok).toBe(false);
  });
  it("requires confirmation before a provider overwrites an explicit payment or lease end", async () => {
    const vehicle = getRegistryVehicles()[demoVins.camry.primary];
    const payment = await buildTwin({ vehicle, raw: { financeType: "loan", financePayment: 450 }, provider: createProvider({ id: "smartcar-simulated" }) });
    expect(payment.ok).toBe(false);
    expect(!payment.ok && payment.error).toContain("payment conflicts");
    const lease = await buildTwin({ vehicle, raw: { financeType: "lease", financePayment: 350, financeEndMonth: 18 }, provider: {
      getAccount: async () => ({ source: "synthetic", finance: { financeType: "lease", balance: 0, monthlyPayment: 350,
        remainingTermMonths: 24, leaseEndMonth: 24, provenance: { financeType: "synthetic", balance: "synthetic", monthlyPayment: "synthetic", remainingTermMonths: "synthetic", leaseEndMonth: "synthetic" } } }),
      getVehicleSignals: async () => ({ mileage: 48000, source: "synthetic" }),
    } });
    expect(lease.ok).toBe(false);
    expect(!lease.ok && lease.error).toContain("lease end month conflicts");
  });
});
