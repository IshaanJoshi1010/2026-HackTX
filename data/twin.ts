import { MAX_INPUT_NUMBER } from "./inputLimits";
import { z } from "zod";
import type { ConnectionProvider, HistoryRecord, Question, RawProfileInput, Source, VehicleConfig, VehicleTwin } from "../contracts";
import { AccountDataSchema, VehicleConfigSchema, VehicleSignalsSchema, VehicleTwinSchema } from "../contracts/schemas";
import { getRegistryEntry, isSupportedVehicle } from "./registry";
import { getHistory } from "./history";
import { syntheticFinance } from "./fixtures/finance";
import { type OnboardingHints, normalizeOnboarding } from "./normalize";
import { applyDefaults } from "./defaults";
import { resolveFinance } from "./finance";
import { validateVin } from "./vin";
import { ProviderNotConfiguredError } from "./providers/types";

export interface BuildTwinInput { vehicle: VehicleConfig; mileage?: number; raw?: RawProfileInput; provider?: ConnectionProvider }
export type BuildTwinResult = { ok: true; twin: VehicleTwin } | { ok: false; error: string };
export interface TwinMetadata {
  mileage: { source: Source; note: string };
  historyState: "synthetic" | "unavailable";
  warnings: string[];
  onboarding: { hints: OnboardingHints; financeQuestion: Question | null; nextAction: string | null };
}
export type DetailedTwinResult = { ok: true; twin: VehicleTwin; metadata: TwinMetadata } | { ok: false; error: string };
export interface TwinDependencies { getHistory?: (vehicleId: string) => HistoryRecord[]; currentYear?: number }
const mileageSchema = z.number().finite().nonnegative().max(MAX_INPUT_NUMBER);

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
      const prepared = normalizeOnboarding(a.raw ?? {});
      if (!prepared.ok) return prepared;
      const driver = applyDefaults(prepared.profile);
      if (a.mileage !== undefined && !mileageSchema.safeParse(a.mileage).success) return { ok: false, error: "Input mileage must be a finite nonnegative number" };
      const warnings: string[] = [...prepared.hints.notes];
      const financeResolution = resolveFinance(driver, prepared.financeInput, {
        price: saved?.listingSnapshot.fields.priceUsd ?? vehicle.msrp,
        vehicleYear: vehicle.year, currentYear: deps.currentYear ?? new Date().getUTCFullYear(),
      });
      let finance = financeResolution.finance;
      let signals: z.infer<typeof VehicleSignalsSchema> | undefined;
      if (a.provider) {
        // A provider failure returns a typed error; never silently replaces connected data.
        const account = AccountDataSchema.parse(await a.provider.getAccount());
        finance = account.finance;
        // Explicit input mileage wins and does not require the signals service to work.
        if (a.mileage === undefined) signals = VehicleSignalsSchema.parse(await a.provider.getVehicleSignals());
        if (prepared.profile.financeType !== undefined && driver.financeType !== finance.financeType) {
          return { ok: false, error: "Profile finance type conflicts with provider account; confirmation is required" };
        }
        if (prepared.financeInput.payment !== undefined && prepared.financeInput.payment !== finance.monthlyPayment) {
          return { ok: false, error: "Supplied payment conflicts with the provider account; confirmation is required" };
        }
        if (prepared.financeInput.endMonth !== undefined && prepared.financeInput.endMonth !== finance.leaseEndMonth) {
          return { ok: false, error: "Supplied lease end month conflicts with the provider account; confirmation is required" };
        }
        driver.financeType = finance.financeType;
        driver.provenance.financeType = finance.provenance.financeType;
      } else {
        if (saved && a.raw?.financeType === undefined && prepared.financeInput.payment === undefined && prepared.financeInput.endMonth === undefined) {
          finance = structuredClone(syntheticFinance);
          driver.financeType = finance.financeType;
          driver.provenance.financeType = "synthetic";
        } else finance.provenance.financeType = driver.provenance.financeType;
        warnings.push(finance === financeResolution.finance ? "Finance amounts use labeled demo estimates, not a lender quote" : "Synthetic demo finance fixture; not a real account");
        if (finance === financeResolution.finance) {
          warnings.push(...financeResolution.assumptions);
          if (financeResolution.nextAction) warnings.push(financeResolution.nextAction);
        }
      }
      if (Object.values(finance).some(value => typeof value === "number" && value > MAX_INPUT_NUMBER))
        return { ok: false, error: "Finance values exceed the supported input range" };
      const mileage = a.mileage ?? signals?.mileage ?? saved?.listingSnapshot.fields.mileage;
      if (!mileageSchema.safeParse(mileage).success) return { ok: false, error: "A valid mileage is required from input, provider signals, or a saved listing" };
      const mileageSource: Source = a.mileage !== undefined ? "user" : signals?.source ?? "synthetic";
      driver.provenance.mileage = mileageSource;
      const note = a.mileage !== undefined ? "explicit input mileage" : signals ? "provider vehicle signals" : "fictional saved listing snapshot";
      // Only registered primary sample records may use their synthetic ownership history.
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
        historyState === "synthetic" ? "synthetic: fictional demo ownership, maintenance and odometer history from data/history.ts" : "history: no history available");
      vehicle.specSources.push(...warnings);
      const parsed = VehicleTwinSchema.safeParse({ vehicle, mileage, history, driver, finance });
      return parsed.success ? { ok: true, twin: parsed.data, metadata: { mileage: { source: mileageSource, note }, historyState, warnings,
          onboarding: { hints: prepared.hints,
            financeQuestion: !a.provider && finance === financeResolution.finance ? financeResolution.question : null,
            nextAction: !a.provider && finance === financeResolution.finance ? financeResolution.nextAction : null } } }
        : { ok: false, error: parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") };
    } catch (error) {
      return { ok: false, error: error instanceof ProviderNotConfiguredError ? error.message : "Twin could not be built: provider data or history is unavailable or invalid" };
    }
  };
}
export const buildTwinWithDetails = createTwinBuilder();
/** Canonical public signature. Validate the entire twin before returning success. */
export async function buildTwin(a: BuildTwinInput): Promise<BuildTwinResult> {
  const result = await buildTwinWithDetails(a);
  return result.ok ? { ok: true, twin: result.twin } : result;
}
