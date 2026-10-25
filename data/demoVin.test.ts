import { afterEach, describe, expect, it, vi } from "vitest";
import { alexDemoVin, buildDemoTwin, buildDemoTwinFromVin, isAlexDemoVin } from "./demo";
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
  it.each(["", "123", "4T1G11AK0NU900001", demoVins.rav4.primary, demoVins.camry.backup, " " + alexDemoVin])("does not map other inputs to Alex: %s", async vin => {
    expect(isAlexDemoVin(vin)).toBe(false);
    expect((await buildDemoTwinFromVin(vin)).ok).toBe(false);
  });
  it("does not attach Alex to ordinary generic twin construction", async () => {
    const result = await buildTwin({ vehicle: getRegistryVehicles()[alexDemoVin] });
    expect(result.ok && result.twin.driver).toMatchObject({ householdSize: 1, children: 0, location: "Not provided" });
  });
});
