import { z } from "zod";
import type { MatchStatus, Source, VehicleConfig } from "../contracts";
import { VehicleConfigSchema } from "../contracts/schemas";
import { camryVehicle, rav4Vehicle } from "./fixtures/vehicles";
import camryPrimary from "./listings/camry-primary.json";
import camryBackup from "./listings/camry-backup.json";
import rav4Primary from "./listings/rav4-primary.json";
import rav4Backup from "./listings/rav4-backup.json";
import { ListingSnapshotSchema, type ListingSnapshot } from "./listings/schema";
import { validateVin } from "./vin";

export interface VerificationFlags {
  model: boolean; year: boolean; trim: boolean; paint: boolean; geometry: boolean;
}
export interface RegistryEntry extends VehicleConfig {
  listingSnapshot: ListingSnapshot;
  paintHex: string;
  verification: VerificationFlags;
  fieldSources: Record<string, Source>;
}
/** C2 asset metadata is local to /data; shared VehicleConfig stays unchanged. */
export interface RegistryAsset {
  vehicleId: string; model: string; year: number; trim: string;
  paintName: string; paintHex: string; glb: string;
}

export function isSupportedVehicle(config: Partial<VehicleConfig>): boolean {
  const clean = (s?: string) => s?.trim().toLowerCase();
  return clean(config.make) === "toyota" && (
    (clean(config.model) === "camry" && config.year === 2022 && clean(config.trim) === "se" && config.powertrain === "gas") ||
    (clean(config.model) === "rav4" && config.year === 2024 && ["xle", "hybrid xle"].includes(clean(config.trim) ?? "") && config.powertrain === "hybrid")
  );
}

/** Exact describes the visual match only; synthetic provenance remains synthetic. */
export function matchStatus(config: RegistryEntry, asset?: RegistryAsset): MatchStatus {
  if (!isSupportedVehicle(config)) return "unsupported";
  const flags = config.verification;
  const allVerified = flags.model === true && flags.year === true && flags.trim === true && flags.paint === true && flags.geometry === true;
  if (!asset || !allVerified) return "representative";
  const equal = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  return asset.glb.startsWith("/") && asset.glb === config.modelAsset && asset.vehicleId === config.id
    && equal(asset.model, config.model) && asset.year === config.year && equal(asset.trim, config.trim)
    && equal(asset.paintName, config.paint) && equal(asset.paintHex, config.paintHex)
    ? "exact" : "representative";
}

const snapshots = [camryPrimary, camryBackup, rav4Primary, rav4Backup].map(s => ListingSnapshotSchema.parse(s));
const makeEntry = (listing: ListingSnapshot): RegistryEntry => {
  const f = listing.fields;
  if (!validateVin(f.vin, { checkDigit: true }).ok) throw new Error(`Invalid synthetic demo VIN in ${listing.id}`);
  const base = [camryVehicle, rav4Vehicle].find(v => v.id === f.vehicleId && v.make === f.make
    && v.model === f.model && v.year === f.year && v.trim === f.trim && v.powertrain === f.powertrain);
  if (!base || f.drive !== (base.id === camryVehicle.id ? "FWD" : "AWD")) {
    throw new Error(`Synthetic listing ${listing.id} does not match its supported vehicle/drivetrain fixture`);
  }
  const fieldSources: Record<string, Source> = Object.fromEntries(Object.keys(base).map(key => [key, "synthetic"]));
  fieldSources.mpg = "sourced";
  fieldSources.vin = "synthetic";
  fieldSources.paintCode = "synthetic";
  fieldSources.paintHex = "synthetic";
  const config = VehicleConfigSchema.parse({
    ...base, vin: f.vin, id: f.vehicleId, make: f.make, model: f.model, year: f.year, trim: f.trim,
    powertrain: f.powertrain, paint: f.paint, paintCode: f.paintCode,
    modelAsset: "", matchStatus: "representative",
    specSources: [
      `synthetic: listing identity, VIN, paint, mileage and price from data/listings/${listing.id}.json; fictional demo, not a real advertisement`,
      `sourced: combined MPG from EPA record ${f.model === "Camry" ? "44348 (FWD LE/SE)" : "47392 (Hybrid AWD)"}; data/fixtures/epa.json`,
      "synthetic: seats, cargoCuFt and msrp are plausible demo assumptions, not verified Toyota specifications",
      "modelAsset unavailable; visual verification pending Kareem's assets",
    ],
  });
  const entry: RegistryEntry = {
    ...config, listingSnapshot: structuredClone(listing), paintHex: f.paintHex, fieldSources,
    verification: { model: false, year: false, trim: false, paint: false, geometry: false },
  };
  entry.matchStatus = matchStatus(entry);
  return entry;
};
const entries = snapshots.map(makeEntry);
// Keep internal entries private; consumers get copies so a caller cannot alter later lookups.
const registry = Object.fromEntries(entries.map(entry => [entry.vin!, entry]));
export const demoVins = Object.freeze({
  camry: Object.freeze({ primary: camryPrimary.fields.vin, backup: camryBackup.fields.vin }),
  rav4: Object.freeze({ primary: rav4Primary.fields.vin, backup: rav4Backup.fields.vin }),
});
export function getRegistryEntries(): RegistryEntry[] { return structuredClone(entries); }
export function getRegistryEntry(vin: string): RegistryEntry | undefined {
  const valid = validateVin(vin);
  return valid.ok && Object.hasOwn(registry, valid.vin) ? structuredClone(registry[valid.vin]) : undefined;
}
export function getRegistryVehicles(): Record<string, VehicleConfig> {
  return Object.fromEntries(entries.map(entry => [entry.vin!, VehicleConfigSchema.parse(entry)]));
}
/** Never honors an exact label without the registry flags and matching asset metadata. */
export function getRegistryMatchStatus(vehicle: VehicleConfig, asset?: RegistryAsset): MatchStatus {
  const entry = vehicle.vin ? getRegistryEntry(vehicle.vin) : undefined;
  if (!entry) return isSupportedVehicle(vehicle) ? "representative" : "unsupported";
  const fields = ["id", "make", "model", "year", "trim", "powertrain", "paint", "paintCode", "modelAsset"] as const;
  if (fields.some(key => vehicle[key] !== entry[key])) return isSupportedVehicle(vehicle) ? "representative" : "unsupported";
  return matchStatus(entry, asset);
}

export const ConfirmedPaintSchema = z.object({
  name: z.string().trim().min(1), hex: z.string().regex(/^#[0-9a-fA-F]{6}$/), confirmed: z.literal(true),
});
export type ConfirmedPaint = z.infer<typeof ConfirmedPaintSchema>;
export type RepresentativePaintResult =
  | { ok: true; vehicle: VehicleConfig }
  | { ok: false; partial: Partial<VehicleConfig>; error: string };
/** Allows a user-chosen representative swatch; does not claim an exact supported model. */
export function confirmRepresentativePaint(partial: Partial<VehicleConfig>, paint: ConfirmedPaint): RepresentativePaintResult {
  const swatch = ConfirmedPaintSchema.safeParse(paint);
  if (!swatch.success) return { ok: false, partial: structuredClone(partial), error: "Confirm a paint name and six-digit hex swatch first" };
  const result: Partial<VehicleConfig> = {
    ...structuredClone(partial), paint: swatch.data.name, matchStatus: "representative",
    specSources: [...(partial.specSources ?? []), `user: confirmed representative paint swatch ${swatch.data.name} (${swatch.data.hex}); actual vehicle paint not verified`],
  };
  // A visual swatch is not a manufacturer paint-code claim.
  delete result.paintCode;
  const complete = VehicleConfigSchema.safeParse(result);
  return complete.success ? { ok: true, vehicle: complete.data }
    : { ok: false, partial: result, error: "Paint confirmed for a representative view; vehicle details are still incomplete" };
}
