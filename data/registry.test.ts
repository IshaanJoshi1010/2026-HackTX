import { afterEach, describe, expect, it, vi } from "vitest";
import { demoVins, getRegistryEntries, getRegistryEntry, getRegistryVehicles, getRegistryMatchStatus,
  matchStatus, confirmRepresentativePaint, type RegistryEntry, type RegistryAsset, type VerificationFlags } from "./registry";
import { identifyVehicle, createVehicleIdentifier } from "./decode";
import { validateVin } from "./vin";
import { IdentifyResultSchema, VehicleConfigSchema } from "../contracts/schemas";
import { ListingSnapshotSchema, listingSnapshotJsonSchema } from "./listings/schema";
import listingSchema from "./listings/listing.schema.json";

const verified = (entry: RegistryEntry) => ({ ...entry, modelAsset: `/models/${entry.id}.glb`,
  verification: { model: true, year: true, trim: true, paint: true, geometry: true } });
const assetFor = (entry: RegistryEntry): RegistryAsset => ({ vehicleId: entry.id, model: entry.model,
  year: entry.year, trim: entry.trim, paintName: entry.paint, paintHex: entry.paintHex, glb: entry.modelAsset });
afterEach(() => vi.unstubAllGlobals());

describe("synthetic listing registry", () => {
  it("has four distinct validated demo VINs, each with a synthetic snapshot and disclosure", () => {
    const entries = getRegistryEntries();
    expect(entries).toHaveLength(4);
    expect(new Set(entries.map(e => e.vin)).size).toBe(4);
    for (const entry of entries) {
      expect(validateVin(entry.vin!, { checkDigit: true }).ok).toBe(true);
      expect(ListingSnapshotSchema.safeParse(entry.listingSnapshot).success).toBe(true);
      expect(VehicleConfigSchema.safeParse(entry).success).toBe(true);
      expect(entry.listingSnapshot.disclosure).toContain("Fictional");
      expect(Object.values(entry.listingSnapshot.provenance).every(source => source === "synthetic")).toBe(true);
      for (const key of Object.keys(VehicleConfigSchema.parse(entry))) expect(entry.fieldSources[key]).toBeDefined();
      expect(entry.fieldSources.vin).toBe("synthetic");
      expect(entry.fieldSources.mpg).toBe("sourced");
      expect(entry.fieldSources.cargoCuFt).toBe("synthetic");
      expect(entry.matchStatus).toBe("representative");
      expect(entry.modelAsset).toBe("");
      expect(entry.listingSnapshot.fields.mileage).toBeGreaterThan(0);
      expect(entry.listingSnapshot.fields.priceUsd).toBeGreaterThan(0);
    }
    expect(getRegistryEntry(demoVins.camry.primary)?.listingSnapshot.fields.mileage).toBe(48000);
  });
  it("keeps the exported JSON Schema aligned with runtime validation", () => {
    expect(listingSchema).toEqual(listingSnapshotJsonSchema);
    expect(listingSchema.properties.provenance.required).toContain("vin");
    const listing = getRegistryEntries()[0].listingSnapshot;
    const { vin: omitted, ...provenance } = listing.provenance;
    expect(omitted).toBe("synthetic");
    expect(ListingSnapshotSchema.safeParse({ ...listing, provenance }).success).toBe(false);
    expect(ListingSnapshotSchema.safeParse({ ...listing, source: "listing" }).success).toBe(false);
    expect(ListingSnapshotSchema.safeParse({ ...listing, fields: { ...listing.fields, paintHex: "red" } }).success).toBe(false);
  });
  it("resolves all primary and backup VINs without any network calls", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("No network allowed"));
    vi.stubGlobal("fetch", fetch);
    for (const pair of Object.values(demoVins)) {
      for (const vin of [pair.primary, pair.backup]) {
        const result = await identifyVehicle(vin.toLowerCase(), { offline: true });
        expect(IdentifyResultSchema.safeParse(result).success).toBe(true);
        expect(result.status).toBe("ok");
        if (result.status !== "ok") throw new Error("Expected registry hit");
        expect(result.decodeState).toBe("registry");
        expect(result.vehicle.vin).toBe(vin);
        expect(result.vehicle.specSources.join(" ")).toContain("fictional demo");
        expect(result.vehicle.matchStatus).toBe("representative");
        expect(result.vehicle.paint).not.toContain("TODO");
      }
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it("isolates returned configs and nested snapshots from later lookups", () => {
    const entry = getRegistryEntry(demoVins.camry.primary)!;
    entry.verification.geometry = true;
    entry.listingSnapshot.fields.priceUsd = 1;
    entry.specSources.push("mutation");
    const configs = getRegistryVehicles();
    configs[demoVins.camry.primary].paint = "changed";
    const fresh = getRegistryEntry(demoVins.camry.primary)!;
    expect(fresh.verification.geometry).toBe(false);
    expect(fresh.listingSnapshot.fields.priceUsd).toBe(22995);
    expect(fresh.specSources).not.toContain("mutation");
    expect(fresh.paint).not.toBe("changed");
    expect(getRegistryEntry("bad")).toBeUndefined();
    expect(getRegistryEntry("toString")).toBeUndefined();
  });
});

describe("honest visual matching", () => {
  it.each([demoVins.camry.primary, demoVins.rav4.primary])("requires all five flags and matching metadata for %s", vin => {
    const entry = verified(getRegistryEntry(vin)!);
    const asset = assetFor(entry);
    expect(matchStatus(entry, asset)).toBe("exact");
    for (const key of Object.keys(entry.verification) as (keyof VerificationFlags)[]) {
      expect(matchStatus({ ...entry, verification: { ...entry.verification, [key]: false } }, asset)).toBe("representative");
    }
    expect(matchStatus(entry)).toBe("representative");
    expect(matchStatus(entry, { ...asset, glb: "" })).toBe("representative");
    expect(matchStatus(entry, { ...asset, vehicleId: "wrong" })).toBe("representative");
    expect(matchStatus(entry, { ...asset, year: 2020 })).toBe("representative");
    expect(matchStatus(entry, { ...asset, model: "Other" })).toBe("representative");
    expect(matchStatus(entry, { ...asset, trim: "LE" })).toBe("representative");
    expect(matchStatus(entry, { ...asset, paintHex: "#FFFFFF" })).toBe("representative");
    expect(matchStatus(entry, { ...asset, paintName: "White" })).toBe("representative");
    expect(matchStatus({ ...entry, modelAsset: "" }, asset)).toBe("representative");
    // Exact visual matching does not turn fictional listing data into verified real data.
    expect(entry.fieldSources.vin).toBe("synthetic");
  });
  it("never promotes unsupported vehicles even with all flags and matching metadata", () => {
    const entry = { ...verified(getRegistryEntry(demoVins.camry.primary)!), model: "Corolla" };
    expect(matchStatus(entry, assetFor(entry))).toBe("unsupported");
  });
  it("does not trust a config's exact label without saved verification evidence", async () => {
    const entry = getRegistryEntry(demoVins.camry.primary)!;
    const spoofed = { ...entry, matchStatus: "exact" as const };
    expect(getRegistryMatchStatus(spoofed, assetFor(spoofed))).toBe("representative");
    const result = await createVehicleIdentifier({ registry: { [entry.vin!]: spoofed }, registryMatchStatus: getRegistryMatchStatus })(entry.vin!);
    expect(result.status === "ok" && result.vehicle.matchStatus).toBe("representative");
  });
});

describe("user-confirmed representative paint", () => {
  const swatch = { name: "Demo blue", hex: "#2255AA", confirmed: true as const };
  it("returns representative only after confirmation, even for a complete unsupported config", () => {
    const input = { ...getRegistryVehicles()[demoVins.camry.primary], model: "Corolla", matchStatus: "unsupported" as const };
    const result = confirmRepresentativePaint(input, swatch);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.vehicle.matchStatus).toBe("representative");
    expect(result.vehicle.paint).toBe("Demo blue");
    expect(result.vehicle.specSources.at(-1)).toContain("user: confirmed representative paint");
    expect(result.vehicle.specSources.at(-1)).toContain("#2255AA");
    expect(input.paint).not.toBe("Demo blue");
    expect(VehicleConfigSchema.safeParse(result.vehicle).success).toBe(true);
  });
  it("preserves incomplete decoded specs without fabricating required fields", () => {
    const result = confirmRepresentativePaint({ vin: "1M8GDM9AXKP042788", model: "Civic", mpg: 30 }, swatch);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected partial vehicle");
    expect(result.partial).toMatchObject({ model: "Civic", mpg: 30, paint: "Demo blue", matchStatus: "representative" });
    expect(result.partial).not.toHaveProperty("msrp");
    expect(result.partial).not.toHaveProperty("modelAsset");
  });
  it("rejects an unconfirmed or malformed swatch", () => {
    const input = getRegistryVehicles()[demoVins.camry.primary];
    expect(confirmRepresentativePaint(input, { ...swatch, confirmed: false } as unknown as typeof swatch).ok).toBe(false);
    expect(confirmRepresentativePaint(input, { ...swatch, hex: "invalid" }).ok).toBe(false);
  });
});
