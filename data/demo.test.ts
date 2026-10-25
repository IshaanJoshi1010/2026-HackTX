import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDemoTwin, demoBrainDump, demoTodayISO } from "./demo";
import { buildTwin } from "./twin";
import { alexProfile } from "./fixtures/alex";
import { demoVins, getRegistryVehicles } from "./registry";
import { auditTwinSources } from "./audit";
import { VehicleTwinSchema } from "../contracts/schemas";
import { mapExtraction } from "../ai/mapper";
import { testDumps } from "../ai/testDumps";

afterEach(() => vi.unstubAllGlobals());

describe("explicit Alex demo preset", () => {
  it.each(["camry-2022-se", "rav4-2024-hybrid-xle"] as const)("loads %s with Alex and synthetic provenance while offline", async vehicleId => {
    const fetch = vi.fn(() => { throw new Error("offline"); });
    vi.stubGlobal("fetch", fetch);
    const result = await buildDemoTwin(vehicleId);
    if (!result.ok) throw new Error(result.error);
    expect(VehicleTwinSchema.safeParse(result.twin).success).toBe(true);
    expect(result.twin.vehicle.id).toBe(vehicleId);
    expect(result.twin.driver).toEqual({ ...alexProfile, provenance: { ...alexProfile.provenance, mileage: "synthetic" } });
    expect(result.twin.driver).toMatchObject({ householdSize: 3, children: 1, carSeats: 0, cargoNeed: "low",
      priorities: { cost: 0.2, family: 0.2, longevity: 0.2, fuel: 0.2, comfort: 0.2 } });
    expect(result.twin.mileage).toBe(vehicleId === "camry-2022-se" ? 48000 : 24000);
    expect(auditTwinSources(result.twin, { mileage: { source: "synthetic", note: "demo provider" } }).missing).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps generic onboarding independent from Alex and isolates demo calls", async () => {
    const generic = await buildTwin({ vehicle: getRegistryVehicles()[demoVins.camry.primary] });
    if (!generic.ok) throw new Error(generic.error);
    expect(generic.twin.driver).toMatchObject({ householdSize: 1, children: 0, location: "Not provided" });
    const first = await buildDemoTwin();
    if (!first.ok) throw new Error(first.error);
    first.twin.driver.householdSize = 99;
    const next = await buildDemoTwin();
    expect(next.ok && next.twin.driver.householdSize).toBe(3);
    expect(alexProfile.householdSize).toBe(3);
  });

  it("aligns the second-child demo with the baseline and leaves changes proposed", async () => {
    const built = await buildDemoTwin();
    if (!built.ok) throw new Error(built.error);
    const before = structuredClone(built.twin);
    expect(demoBrainDump).toBe(testDumps[0].prompt);
    const mapped = mapExtraction(testDumps[0].expected, { vehicle: built.twin.vehicle,
      profile: built.twin.driver, existingEvents: [], todayISO: demoTodayISO }, demoBrainDump).result;
    if (!mapped.aiAvailable) throw new Error("Expected deterministic fixture mapping");
    expect(mapped.proposals.find(event => event.type === "family_change")).toMatchObject({
      month: 32, payload: { children: 2 }, status: "proposed",
    });
    expect(mapped.proposals.every(event => event.status === "proposed")).toBe(true);
    expect(mapped.proposals.some(event => "carSeats" in event.payload)).toBe(false);
    expect(built.twin).toEqual(before);
  });
});
