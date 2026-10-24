import type { ConnectionProvider, DriverProfile, FinanceState, Source } from "../../contracts";
import { AccountDataSchema, VehicleSignalsSchema } from "../../contracts/schemas";
import { applyDefaults } from "../defaults";
import { ProviderNotConfiguredError } from "./types";
export type ProviderMappingResult = { ok: true; profile: DriverProfile; finance: FinanceState; mileage: number; mileageSource: Source }
  | { ok: false; error: string };
/** Returns a draft; never writes provider values into a confirmed profile. */
export function mapProviderData(accountInput: unknown, signalsInput: unknown, profile: Partial<DriverProfile> = {}): ProviderMappingResult {
  try {
    const account = AccountDataSchema.parse(accountInput), signals = VehicleSignalsSchema.parse(signalsInput);
    if (profile.financeType !== undefined && profile.financeType !== account.finance.financeType) return { ok: false, error: "Provider finance type differs from the supplied profile; confirmation is required" };
    const draft = applyDefaults({ ...structuredClone(profile), financeType: account.finance.financeType,
      provenance: { ...profile.provenance, financeType: account.finance.provenance.financeType } });
    return { ok: true, profile: draft, finance: structuredClone(account.finance), mileage: signals.mileage, mileageSource: signals.source };
  } catch { return { ok: false, error: "Provider data or profile failed validation" }; }
}
export async function loadProviderData(provider: ConnectionProvider, profile: Partial<DriverProfile> = {}): Promise<ProviderMappingResult> {
  try {
    const [account, signals] = await Promise.all([provider.getAccount(), provider.getVehicleSignals()]);
    return mapProviderData(account, signals, profile);
  } catch (error) {
    return { ok: false, error: error instanceof ProviderNotConfiguredError ? error.message : "Connection provider is unavailable; no account data was applied" };
  }
}
