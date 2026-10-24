import { identifyVehicle } from "./decode";
import { alexProfile } from "./fixtures/alex";
import { createProvider, type DemoVehicleId } from "./providers";
import { demoVins } from "./registry";
import { buildTwin, type BuildTwinResult } from "./twin";

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
