import { identifyVehicle } from "./decode";
import { alexProfile } from "./fixtures/alex";
import { createProvider, type DemoVehicleId } from "./providers";
import { demoVins } from "./registry";
import { buildTwin, type BuildTwinResult } from "./twin";
import { rav4DemoFinance } from "./fixtures/finance";
import { validateVin } from "./vin";

export const demoBrainDump = "I'm moving to Denver next year, driving 20,000 miles annually, and expecting my second child in 2029.";
export const demoTodayISO = "2026-10-24";

/** Explicit fictional demo only. Generic onboarding must keep using buildTwin with the user's inputs. */
export async function buildDemoTwin(vehicleId: DemoVehicleId = "camry-2022-se"): Promise<BuildTwinResult> {
  if (vehicleId !== "camry-2022-se" && vehicleId !== "rav4-2024-hybrid-xle") {
    return { ok: false, error: "Unsupported demo vehicle" };
  }
  const vin = vehicleId === "camry-2022-se" ? demoVins.camry.primary : demoVins.rav4.primary;
  const identified = await identifyVehicle(vin, { offline: true });
  if (identified.status !== "ok") return { ok: false, error: "The saved demo vehicle could not be loaded" };
  const base = createProvider({ vehicleId });
  const provider = vehicleId === "rav4-2024-hybrid-xle" ? {
    getVehicleSignals: () => base.getVehicleSignals(),
    getAccount: async () => ({ ...(await base.getAccount()), finance: structuredClone(rav4DemoFinance) }),
  } : base;
  return buildTwin({ vehicle: identified.vehicle, raw: { ...structuredClone(alexProfile) }, provider });
}

/** Fictional VIN already reserved in the synthetic registry. Never send it to a live decoder. */
export const alexDemoVin = demoVins.camry.primary;
export function isAlexDemoVin(vin: string): boolean {
  const validated = validateVin(vin, { checkDigit: true });
  return validated.ok && validated.vin === alexDemoVin;
}
export const demoStartingVins = Object.freeze({
  "camry-2022-se": demoVins.camry.primary,
  "rav4-2024-hybrid-xle": demoVins.rav4.primary,
});
/** Exactly two reserved primary demo VINs; backup or ordinary VINs never silently inherit a demo persona. */
export function getDemoVehicleId(vin: string): DemoVehicleId | undefined {
  const validated = validateVin(vin, { checkDigit: true });
  if (!validated.ok) return undefined;
  return (Object.keys(demoStartingVins) as DemoVehicleId[]).find(id => demoStartingVins[id] === validated.vin);
}
export function isDemoVin(vin: string): boolean { return getDemoVehicleId(vin) !== undefined; }
/** Explicit demo-only VIN entry for either supported car. No real decoder or UI changes. */
export async function buildDemoTwinFromVin(vin: string): Promise<BuildTwinResult> {
  const vehicleId = getDemoVehicleId(vin);
  if (!vehicleId) return { ok: false, error: "Enter a fictional Fork demo VIN" };
  return buildDemoTwin(vehicleId);
}
