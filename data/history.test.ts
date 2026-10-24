import { afterEach, describe, expect, it, vi } from "vitest";
import { getHistory } from "./history";
import { demoVins, getRegistryEntry, getRegistryVehicles } from "./registry";
import { HistoryRecordSchema } from "../contracts/schemas";
import { buildTwinWithDetails } from "./twin";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("C4 synthetic ownership history", () => {
  it.each([demoVins.camry.primary, demoVins.rav4.primary])("matches the primary snapshot and twin mileage for %s", async vin => {
    const entry = getRegistryEntry(vin)!;
    const history = getHistory(entry.id);
    expect(history.length).toBeGreaterThan(10);
    for (let index = 0; index < history.length; index++) {
      const record = history[index];
      expect(HistoryRecordSchema.safeParse(record).success).toBe(true);
      expect(record.source).toBe("synthetic");
      expect(record.description).toMatch(/^Synthetic:/);
      expect(record.provenance).toContain("Fictional");
      expect(record.provenance).toContain(entry.listingSnapshot.id);
      expect(record.date <= entry.listingSnapshot.capturedOn).toBe(true);
      expect(record.mileage).toBeLessThanOrEqual(entry.listingSnapshot.fields.mileage);
      if (index > 0) {
        expect(record.date >= history[index - 1].date).toBe(true);
        expect(record.mileage).toBeGreaterThanOrEqual(history[index - 1].mileage);
      }
    }
    const last = history.at(-1)!;
    expect(last.type).toBe("odometer");
    expect(last.date).toBe(entry.listingSnapshot.capturedOn);
    expect(last.mileage).toBe(entry.listingSnapshot.fields.mileage);
    const result = await buildTwinWithDetails({ vehicle: getRegistryVehicles()[vin] });
    if (!result.ok) throw new Error(result.error);
    expect(result.twin.history).toEqual(history);
    expect(result.twin.mileage).toBe(last.mileage);
    expect(result.metadata.historyState).toBe("synthetic");
    expect(result.twin.vehicle.specSources).toContain("synthetic: fictional demo ownership, maintenance and odometer history from data/history.ts");
  });
  it("keeps the Camry at 12,000 miles per year through the 48,000-mile demo anchor", () => {
    const history = getHistory("camry-2022-se");
    const annual = history.filter(r => r.type === "odometer" && r.date.endsWith("-10-24"));
    expect(annual.map(r => [r.date, r.mileage])).toEqual([
      ["2022-10-24", 0], ["2023-10-24", 12000], ["2024-10-24", 24000],
      ["2025-10-24", 36000], ["2026-10-24", 48000],
    ]);
  });
  it("includes purchase, first service, routine maintenance and prior service records", () => {
    for (const id of ["camry-2022-se", "rav4-2024-hybrid-xle"]) {
      const history = getHistory(id);
      expect(history[0]).toMatchObject({ type: "ownership", mileage: 0 });
      expect(history.some(r => r.type === "ownership" && r.description.includes("first routine service") && r.mileage === 5000)).toBe(true);
      const rotations = history.filter(r => r.description.includes("tire rotation"));
      expect(rotations.length).toBeGreaterThan(0);
      expect(rotations.every(r => r.mileage % 5000 === 0)).toBe(true);
      const oil = history.filter(r => r.description.includes("oil and filter"));
      expect(oil.length).toBeGreaterThan(0);
      expect(oil.every(r => r.mileage % 10000 === 0)).toBe(true);
      expect(history.some(r => r.type === "service")).toBe(true);
      expect(history.every(r => !("payload" in r) && !("status" in r) && !("month" in r))).toBe(true);
    }
  });
  it("uses the snapshot anchor consistently and stays deterministic with the network disabled", () => {
    const before = getHistory("camry-2022-se");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2035-01-01T00:00:00Z"));
    const fetch = vi.fn(() => { throw new Error("Network disabled"); });
    vi.stubGlobal("fetch", fetch);
    expect(getHistory("camry-2022-se")).toEqual(before);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("returns isolated copies and no records for unknown vehicles", () => {
    const first = getHistory("camry-2022-se");
    first[0].mileage = 100000;
    first.splice(1);
    expect(getHistory("camry-2022-se")[0].mileage).toBe(0);
    expect(getHistory("camry-2022-se").length).toBeGreaterThan(10);
    expect(getHistory("unknown")).toEqual([]);
    expect(getHistory("toString")).toEqual([]);
  });
  it("does not attach another car's history to backups, custom VINs or changed odometers", async () => {
    const configs = getRegistryVehicles();
    for (const vin of [demoVins.camry.backup, demoVins.rav4.backup]) {
      const result = await buildTwinWithDetails({ vehicle: configs[vin] });
      if (!result.ok) throw new Error(result.error);
      expect(result.twin.history).toEqual([]);
      expect(result.metadata.historyState).toBe("unavailable");
    }
    const result = await buildTwinWithDetails({ vehicle: configs[demoVins.camry.primary], mileage: 49000 });
    if (!result.ok) throw new Error(result.error);
    expect(result.twin.history).toEqual([]);
    expect(result.metadata.warnings.join(" ")).toContain("No history available");
    const custom = await buildTwinWithDetails({ vehicle: { ...configs[demoVins.camry.primary], vin: "1M8GDM9AXKP042788" }, mileage: 48000 });
    if (!custom.ok) throw new Error(custom.error);
    expect(custom.twin.history).toEqual([]);
  });
});
