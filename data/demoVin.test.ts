import { afterEach, describe, expect, it, vi } from "vitest";
import { alexDemoVin, buildDemoTwin, buildDemoTwinFromVin, isAlexDemoVin, demoStartingVins, getDemoVehicleId, isDemoVin } from "./demo";
import { identifyVehicle } from "./decode";
import { validateVin } from "./vin";
import { demoVins, getRegistryVehicles } from "./registry";
import { buildTwin } from "./twin";

afterEach(() => vi.unstubAllGlobals());
describe("explicit fictional Alex VIN", () => {
  it("has a valid check digit, identifies offline, and loads the identical Alex preset without fetching", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetch);
    expect(validateVin(alexDemoVin, { checkDigit: true }).ok).toBe(true);
    const identified = await identifyVehicle(alexDemoVin, { offline: true });
    expect(identified.status).toBe("ok");
    const built = await buildDemoTwinFromVin(alexDemoVin.toLowerCase());
    expect(built).toEqual(await buildDemoTwin());
    expect(built.ok && built.twin).toMatchObject({ mileage: 48000, vehicle: { id: "camry-2022-se", vin: alexDemoVin, matchStatus: "representative" }, driver: { householdSize: 3, children: 1, annualMiles: 12000 } });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["", "123", "4T1G11AK0NU900001", demoVins.rav4.backup, demoVins.camry.backup, " " + alexDemoVin])("does not map other inputs to Alex: %s", async vin => {
    expect(isAlexDemoVin(vin)).toBe(false);
    expect((await buildDemoTwinFromVin(vin)).ok).toBe(false);
  });
  it("does not attach Alex to ordinary generic twin construction", async () => {
    const result = await buildTwin({ vehicle: getRegistryVehicles()[alexDemoVin] });
    expect(result.ok && result.twin.driver).toMatchObject({ householdSize: 1, children: 0, location: "Not provided" });
  });
});

describe("two independent starting VINs", () => {
  it.each(Object.entries(demoStartingVins))("loads %s through its explicit VIN without networking", async (vehicleId, vin) => {
    const fetch = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetch);
    expect(isDemoVin(vin.toLowerCase())).toBe(true);
    expect(getDemoVehicleId(vin)).toBe(vehicleId);
    const built = await buildDemoTwinFromVin(vin);
    if (!built.ok) throw new Error(built.error);
    expect(built.twin.vehicle.id).toBe(vehicleId);
    expect(built.twin.vehicle.vin).toBe(vin);
    expect(built.twin.vehicle.matchStatus).toBe("representative");
    expect(built.twin.finance).toMatchObject(vehicleId === "camry-2022-se"
      ? { balance: 15000, monthlyPayment: 450, remainingTermMonths: 36 }
      : { balance: 24000, monthlyPayment: 650, remainingTermMonths: 60 });
    expect(Object.values(built.twin.finance.provenance).every(source => source === "synthetic")).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps the Camry-only legacy predicate narrow and isolates both presets", async () => {
    expect(isAlexDemoVin(demoStartingVins["rav4-2024-hybrid-xle"])).toBe(false);
    const first = await buildDemoTwinFromVin(demoStartingVins["rav4-2024-hybrid-xle"]);
    if (!first.ok) throw new Error(first.error);
    first.twin.finance.balance = 1;
    const next = await buildDemoTwinFromVin(demoStartingVins["rav4-2024-hybrid-xle"]);
    expect(next.ok && next.twin.finance.balance).toBe(24000);
    const camry = await buildDemoTwinFromVin(alexDemoVin);
    expect(camry.ok && camry.twin.finance.balance).toBe(15000);
  });
});
