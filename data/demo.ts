import { identifyVehicle } from "./decode";
import { alexProfile } from "./fixtures/alex";
import { createProvider, type DemoVehicleId } from "./providers";
import { demoVins } from "./registry";
import { buildTwin, type BuildTwinResult } from "./twin";
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
  return buildTwin({ vehicle: identified.vehicle, raw: { ...structuredClone(alexProfile) }, provider: createProvider({ vehicleId }) });
}

/** Fictional VIN already reserved in the synthetic registry. Never send it to a live decoder. */
export const alexDemoVin = demoVins.camry.primary;
export function isAlexDemoVin(vin: string): boolean {
  const validated = validateVin(vin, { checkDigit: true });
  return validated.ok && validated.vin === alexDemoVin;
}
/** Explicit demo-only VIN entry. Unknown VINs never inherit Alex's household or finance. */
export async function buildDemoTwinFromVin(vin: string): Promise<BuildTwinResult> {
  if (!isAlexDemoVin(vin)) return { ok: false, error: "Enter the fictional Alex demo VIN" };
  return buildDemoTwin("camry-2022-se");
}
