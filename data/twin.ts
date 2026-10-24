import { z } from "zod";
import type { ConnectionProvider, FinanceState, HistoryRecord, RawProfileInput, Source, VehicleConfig, VehicleTwin } from "../contracts";
import { AccountDataSchema, VehicleConfigSchema, VehicleSignalsSchema, VehicleTwinSchema } from "../contracts/schemas";
import { getRegistryEntry, isSupportedVehicle } from "./registry";
import { getHistory } from "./history";
import { syntheticFinance } from "./fixtures/finance";
import { prepareTwinProfile } from "./twin-profile";
import { validateVin } from "./vin";

export interface BuildTwinInput { vehicle: VehicleConfig; mileage?: number; raw?: RawProfileInput; provider?: ConnectionProvider }
export type BuildTwinResult = { ok: true; twin: VehicleTwin } | { ok: false; error: string };
export interface TwinMetadata {
  mileage: { source: Source; note: string };
  historyState: "synthetic" | "unavailable";
  warnings: string[];
}
export type DetailedTwinResult = { ok: true; twin: VehicleTwin; metadata: TwinMetadata } | { ok: false; error: string };
export interface TwinDependencies { getHistory?: (vehicleId: string) => HistoryRecord[] }
const mileageSchema = z.number().finite().nonnegative();

function defaultFinance(financeType: FinanceState["financeType"]): FinanceState {
  const paidOff = financeType === "paid_off";
  const lease = financeType === "lease";
  return { financeType, balance: paidOff || lease ? 0 : 15000,
    monthlyPayment: paidOff ? 0 : lease ? 350 : 450, remainingTermMonths: paidOff ? 0 : lease ? 24 : 36,
    ...(lease ? { leaseEndMonth: 24 } : {}),
    provenance: { financeType: "estimated", balance: "illustrative", monthlyPayment: "illustrative", remainingTermMonths: "illustrative",
      ...(lease ? { leaseEndMonth: "illustrative" as const } : {}) } };
}

export function createTwinBuilder(deps: TwinDependencies = {}) {
  return async function buildWithDetails(a: BuildTwinInput): Promise<DetailedTwinResult> {
    try {
      const parsedVehicle = VehicleConfigSchema.safeParse(a?.vehicle);
      if (!parsedVehicle.success) return { ok: false, error: "Invalid vehicle configuration" };
      const vehicle = structuredClone(parsedVehicle.data);
      if (vehicle.vin) {
        const valid = validateVin(vehicle.vin);
        if (!valid.ok) return { ok: false, error: `Invalid VIN: ${valid.reason}` };
        vehicle.vin = valid.vin;
      }
      const saved = vehicle.vin ? getRegistryEntry(vehicle.vin) : undefined;
      // Saved VIN identity cannot be silently replaced with picker or decoder fields.
      if (saved && (["id", "make", "model", "year", "trim", "powertrain"] as const).some(key => saved[key] !== vehicle[key])) {
        return { ok: false, error: "Vehicle identity does not match the saved VIN" };
      }
      // C7 does not verify visual assets. User-supplied exact labels cannot bypass C2.
      vehicle.matchStatus = isSupportedVehicle(vehicle) ? "representative" : "unsupported";
      const prepared = prepareTwinProfile(a.raw);
      if (!prepared.ok) return prepared;
      const driver = prepared.profile;
      if (a.mileage !== undefined && !mileageSchema.safeParse(a.mileage).success) return { ok: false, error: "Input mileage must be a finite nonnegative number" };
      const warnings: string[] = [];
      let finance = defaultFinance(driver.financeType);
      let signals: z.infer<typeof VehicleSignalsSchema> | undefined;
      if (a.provider) {
        // A provider failure returns a typed error; never silently replaces connected data.
        const account = AccountDataSchema.parse(await a.provider.getAccount());
        finance = account.finance;
        // Explicit input mileage wins and does not require the signals service to work.
        if (a.mileage === undefined) signals = VehicleSignalsSchema.parse(await a.provider.getVehicleSignals());
        if (a.raw?.financeType !== undefined && driver.financeType !== finance.financeType) {
          return { ok: false, error: "Profile finance type conflicts with provider account; confirmation is required" };
        }
        driver.financeType = finance.financeType;
        driver.provenance.financeType = finance.provenance.financeType;
      } else {
        if (saved && a.raw?.financeType === undefined) {
          finance = structuredClone(syntheticFinance);
          driver.financeType = finance.financeType;
          driver.provenance.financeType = "synthetic";
        } else finance.provenance.financeType = driver.provenance.financeType;
        warnings.push(saved && a.raw?.financeType === undefined
          ? "Synthetic demo finance fixture; not a real account"
          : "Finance uses labeled illustrative demo assumptions; user-specific finance estimation is pending C5/C6");
      }
      const mileage = a.mileage ?? signals?.mileage ?? saved?.listingSnapshot.fields.mileage;
      if (!mileageSchema.safeParse(mileage).success) return { ok: false, error: "A valid mileage is required from input, provider signals, or a saved listing" };
      const mileageSource: Source = a.mileage !== undefined ? "user" : signals?.source ?? "synthetic";
      const note = a.mileage !== undefined ? "explicit input mileage" : signals ? "provider vehicle signals" : "fictional saved listing snapshot";
      // Only registered primary sample records may use the minimal seeded history.
      let history = saved && saved.listingSnapshot.id.endsWith("-primary") ? (deps.getHistory ?? getHistory)(vehicle.id) : [];
      if (history.some((record, index) => record.source !== "synthetic" || (index > 0 &&
        (record.date < history[index - 1].date || record.mileage < history[index - 1].mileage)))) {
        return { ok: false, error: "Sample history must be synthetic, chronological and have non-decreasing mileage" };
      }
      const matchesMileage = history.length > 0 && history[history.length - 1].mileage === mileage;
      if (!matchesMileage) history = [];
      const historyState = history.length > 0 ? "synthetic" : "unavailable";
      if (historyState === "unavailable") warnings.push("No history available for this vehicle and odometer; no historical events were inferred from the VIN");
      vehicle.specSources.push(`${mileageSource}: twin mileage from ${note}`,
        historyState === "synthetic" ? "synthetic: minimal demo odometer history; detailed service history pending C4" : "history: no history available");
      vehicle.specSources.push(...warnings);
      const parsed = VehicleTwinSchema.safeParse({ vehicle, mileage, history, driver, finance });
      return parsed.success ? { ok: true, twin: parsed.data, metadata: { mileage: { source: mileageSource, note }, historyState, warnings } }
        : { ok: false, error: parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") };
    } catch {
      return { ok: false, error: "Twin could not be built: provider data or history is unavailable or invalid" };
    }
  };
}
export const buildTwinWithDetails = createTwinBuilder();
/** Canonical public signature. Validate the entire twin before returning success. */
export async function buildTwin(a: BuildTwinInput): Promise<BuildTwinResult> {
  const result = await buildTwinWithDetails(a);
  return result.ok ? { ok: true, twin: result.twin } : result;
}
