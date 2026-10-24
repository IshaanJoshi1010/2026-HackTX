import { z } from "zod";
import type { IdentifyResult, Source, SpecSheet, VehicleConfig } from "../contracts";
import { SpecSheetSchema, VehicleConfigSchema } from "../contracts/schemas";
import { validateVin } from "./vin";
import { getSpecEntries } from "./specs";
import { getRegistryMatchStatus, getRegistryVehicles, isSupportedVehicle } from "./registry";

export const NHTSA_BASE_URL = "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/";
export type FetchLike = (input: string, init?: RequestInit) => Promise<Pick<Response, "ok" | "status" | "json">>;
const NhtsaRecordSchema = z.object({
  VIN: z.string().nullish(), Make: z.string().nullish(), Model: z.string().nullish(),
  ModelYear: z.string().nullish(), Trim: z.string().nullish(), FuelTypePrimary: z.string().nullish(),
  ElectrificationLevel: z.string().nullish(), EngineCylinders: z.string().nullish(),
  DisplacementL: z.string().nullish(), DriveType: z.string().nullish(), ErrorCode: z.string(),
});
const ResponseSchema = z.object({ Results: z.array(NhtsaRecordSchema).length(1) });
type NhtsaRecord = z.infer<typeof NhtsaRecordSchema>;
export interface DecodedFields {
  vehicle: Partial<VehicleConfig>;
  fieldSources: Partial<Record<keyof VehicleConfig, Source>>;
  driveType?: string;
}
export type DecodeResult =
  | { ok: true; decoded: DecodedFields }
  | { ok: false; reason: string };

/** Low-level adapter with a deadline covering both the request and response body. */
export async function decodeVin(vin: string, opts?: { timeoutMs?: number; fetch?: FetchLike }): Promise<DecodeResult> {
  const valid = validateVin(vin);
  if (!valid.ok) return { ok: false, reason: `Invalid VIN: ${valid.reason}` };
  const timeoutMs = opts?.timeoutMs ?? 3000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return { ok: false, reason: "Decode unavailable: invalid timeout" };
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const request = async (): Promise<DecodeResult> => {
      const response = await (opts?.fetch ?? globalThis.fetch)(`${NHTSA_BASE_URL}${valid.vin}?format=json`, { signal: controller.signal });
      if (!response.ok) return { ok: false, reason: `Decode unavailable: NHTSA HTTP ${response.status}` };
      const parsed = ResponseSchema.safeParse(await response.json());
      if (!parsed.success) return { ok: false, reason: "Decode unavailable: malformed NHTSA response" };
      const record = parsed.data.Results[0];
      if (record.VIN && record.VIN.toUpperCase() !== valid.vin) return { ok: false, reason: "Decode unavailable: NHTSA returned a different VIN" };
      // Nonzero decoder codes may describe corrected or incomplete VINs. Do not trust those silently.
      if (record.ErrorCode.trim() !== "0") return { ok: false, reason: `Decode unavailable: NHTSA decoder code ${record.ErrorCode || "missing"}` };
      return { ok: true, decoded: mapDecodedFields(valid.vin, record) };
    };
    const deadline = new Promise<DecodeResult>(resolve => {
      timer = setTimeout(() => {
        resolve({ ok: false, reason: "Decode unavailable: NHTSA timed out" });
        controller.abort();
      }, timeoutMs);
    });
    return await Promise.race([request(), deadline]);
  } catch {
    return { ok: false, reason: "Decode unavailable: NHTSA network or response failure" };
  } finally {
    clearTimeout(timer);
  }
}

function mapDecodedFields(vin: string, record: NhtsaRecord): DecodedFields {
  const vehicle: Partial<VehicleConfig> = { vin, matchStatus: "representative", specSources: ["user: vin"] };
  const fieldSources: DecodedFields["fieldSources"] = { vin: "user" };
  const source = `${NHTSA_BASE_URL}${vin}?format=json`;
  const put = <K extends keyof VehicleConfig>(key: K, value: VehicleConfig[K]) => {
    vehicle[key] = value;
    fieldSources[key] = "sourced";
    vehicle.specSources!.push(`sourced: ${key} from NHTSA vPIC (${source})`);
  };
  const clean = (value: string | null | undefined) => {
    const s = value?.trim();
    return s && !["not applicable", "not available", "unknown", "n/a"].includes(s.toLowerCase()) ? s : undefined;
  };
  const make = clean(record.Make), model = clean(record.Model), trim = clean(record.Trim);
  if (make) put("make", make);
  if (model) put("model", model);
  if (trim) put("trim", trim);
  if (record.ModelYear && /^\d{4}$/.test(record.ModelYear) && Number(record.ModelYear) >= 1886) put("year", Number(record.ModelYear));
  const electric = clean(record.ElectrificationLevel)?.toLowerCase();
  const fuel = clean(record.FuelTypePrimary)?.toLowerCase();
  if (electric?.includes("hybrid") && !electric.includes("plug-in")) put("powertrain", "hybrid");
  else if ((electric?.startsWith("not electrified") || record.ElectrificationLevel?.trim().toLowerCase() === "not applicable") && fuel === "gasoline") put("powertrain", "gas");
  // VehicleConfig has no engine or drivetrain field. Keep sourced evidence without changing shared types.
  for (const key of ["EngineCylinders", "DisplacementL", "DriveType", "FuelTypePrimary", "ElectrificationLevel"] as const) {
    const value = clean(record[key]);
    if (value) vehicle.specSources!.push(`sourced: ${key}=${value} from NHTSA vPIC (${source})`);
  }
  return { vehicle, fieldSources, driveType: clean(record.DriveType) };
}

export interface SpecEntry {
  make: string; model: string; year: number; trim: string; powertrain: VehicleConfig["powertrain"];
  driveType: string; sheet: SpecSheet; source: string;
}
/** Exact identity matching only. Never fills unknown paint, history, mileage or asset fields. */
export function mergeVehicleSpecs(decoded: DecodedFields, specs: readonly SpecEntry[]): DecodedFields {
  const vehicle = structuredClone(decoded.vehicle);
  const fieldSources = { ...decoded.fieldSources };
  const equal = (a: unknown, b: unknown) => typeof a === "string" && typeof b === "string" && a.trim().toLowerCase() === b.trim().toLowerCase();
  const candidates = specs.filter(s => equal(s.make, vehicle.make) && equal(s.model, vehicle.model)
    && s.year === vehicle.year && equal(s.trim, vehicle.trim) && s.powertrain === vehicle.powertrain
    && equal(s.driveType, decoded.driveType));
  // Two variants (for example FWD/AWD) are ambiguous until a more specific registry mapping exists.
  if (candidates.length !== 1) return { ...decoded, vehicle, fieldSources };
  const entry = candidates[0];
  const parsed = SpecSheetSchema.safeParse(entry.sheet);
  if (!parsed.success || !entry.source.trim()) return { ...decoded, vehicle, fieldSources };
  const sheet = parsed.data;
  for (const [field, specField] of [["mpg", "mpgCombined"], ["seats", "seats"], ["cargoCuFt", "cargoCuFt"], ["msrp", "msrp"]] as const) {
    if (vehicle[field] !== undefined) continue;
    vehicle[field] = sheet[specField];
    fieldSources[field] = sheet.sources[specField];
    vehicle.specSources = [...(vehicle.specSources ?? []), `${sheet.sources[specField]}: ${field} from ${entry.source}`];
  }
  return { ...decoded, vehicle, fieldSources };
}

export interface IdentifierDependencies {
  registry?: Readonly<Record<string, VehicleConfig>>;
  specs?: readonly SpecEntry[];
  fetch?: FetchLike;
  registryMatchStatus?: (vehicle: VehicleConfig) => VehicleConfig["matchStatus"];
}
/** Dependency injection supports saved registry entries and fully offline adapter tests. */
export function createVehicleIdentifier(deps: IdentifierDependencies = {}) {
  return async (vin: string, opts?: { offline?: boolean; timeoutMs?: number }): Promise<IdentifyResult> => {
    const valid = validateVin(vin);
    if (!valid.ok) return { status: "invalid", reason: valid.reason };
    const input: Partial<VehicleConfig> = { vin: valid.vin, matchStatus: "unsupported", specSources: ["user: vin"] };
    if (deps.registry && Object.hasOwn(deps.registry, valid.vin)) {
      const saved = VehicleConfigSchema.safeParse(deps.registry[valid.vin]);
      if (!saved.success || saved.data.vin !== valid.vin) return { status: "unsupported", partial: input, reason: "Saved registry entry is invalid" };
      // Bare injected configs have no verification evidence and remain representative.
      const vehicle = structuredClone(saved.data);
      vehicle.matchStatus = isSupportedVehicle(vehicle)
        ? (deps.registryMatchStatus?.(structuredClone(vehicle)) ?? "representative") : "unsupported";
      return isSupportedVehicle(vehicle) ? { status: "ok", vehicle, decodeState: "registry" }
        : { status: "unsupported", partial: vehicle, reason: "Vehicle is outside Fork's supported models" };
    }
    if (opts?.offline) return { status: "unsupported", partial: input, reason: "Decode unavailable: offline and VIN not in registry" };
    const result = await decodeVin(valid.vin, { timeoutMs: opts?.timeoutMs, fetch: deps.fetch });
    if (!result.ok) return { status: "unsupported", partial: input, reason: result.reason };
    const { vehicle } = mergeVehicleSpecs(result.decoded, deps.specs ?? []);
    const isSupported = isSupportedVehicle(vehicle);
    vehicle.matchStatus = isSupported ? "representative" : "unsupported";
    if (!isSupported) return { status: "unsupported", partial: vehicle, reason: "Vehicle is outside Fork's supported models or identity is incomplete" };
    const complete = VehicleConfigSchema.safeParse(vehicle);
    return complete.success ? { status: "ok", vehicle: complete.data, decodeState: "nhtsa" }
      : { status: "unsupported", partial: vehicle, reason: "Supported model decoded; vehicle details incomplete. Listing, assets and sourced specs are still required" };
  };
}

// Synthetic demo records resolve offline; C3 supplies source-labeled spec sheets.
export const identifyVehicle = createVehicleIdentifier({
  registry: getRegistryVehicles(), registryMatchStatus: getRegistryMatchStatus, specs: getSpecEntries(),
});
