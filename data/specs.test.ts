import { describe, expect, it, vi } from "vitest";
import { getSpecs, getSpecDetails, requiredFields, supportedSpecIds, getSpecEntries } from "./specs";
import { getRegistryEntries } from "./registry";
import { SpecSheetSchema } from "../contracts/schemas";
import { mergeVehicleSpecs } from "./decode";
import epa from "./fixtures/epa.json";

function numericLeaves(value: unknown, prefix = ""): string[] {
  if (typeof value === "number") return [prefix];
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => numericLeaves(child, prefix ? `${prefix}.${key}` : key));
}

describe("C3 source-labeled spec sheets", () => {
  it.each(supportedSpecIds)("provides all required fields and a source for every numeric leaf: %s", id => {
    const details = getSpecDetails(id);
    const sheet = getSpecs(id);
    expect(SpecSheetSchema.safeParse(sheet).success).toBe(true);
    expect(details.sheet).toEqual(sheet);
    for (const key of requiredFields) expect(sheet[key]).toBeDefined();
    const leaves = numericLeaves(sheet);
    expect(new Set(Object.keys(details.numericSources))).toEqual(new Set(leaves));
    for (const path of leaves) {
      const source = details.numericSources[path];
      expect(["sourced", "synthetic", "illustrative"]).toContain(source.label);
      expect(source.source.length).toBeGreaterThan(30);
      expect(sheet.sources[path.split(".")[0]]).toBe(source.label);
    }
    expect(sheet.sources.rearSeatWidthIn).toBe("synthetic");
    expect(details.fitStatus).toEqual({ carSeatFit: "needs_verification", packingFit: "needs_verification" });
    expect(sheet.verified).toEqual({ carSeatFit: false, packingFit: false });
    expect(details.officialResources).toEqual([]);
  });
  it("uses the FWD Camry and AWD RAV4 EPA rows without EPA's default costs or unreported cargo", () => {
    for (const [id, epaId, powertrain, drive] of [
      ["camry-2022-se", "44348", "gas", "FWD"], ["rav4-2024-hybrid-xle", "47392", "hybrid", "AWD"],
    ]) {
      const details = getSpecDetails(id);
      const row = epa.records.find(r => r.id === epaId)!;
      expect([details.sheet.mpgCity, details.sheet.mpgHwy, details.sheet.mpgCombined]).toEqual([Number(row.city08), Number(row.highway08), Number(row.comb08)]);
      expect(details.powertrain).toBe(powertrain);
      expect(details.drive).toBe(drive);
      expect(details.numericSources.mpgCombined.source).toContain(`vehicle/${epaId}`);
      expect(details.sheet.cargoCuFt).toBeGreaterThan(0);
      expect(details.sheet.sources.cargoCuFt).toBe("synthetic");
      expect(details.sheet).not.toHaveProperty("fuelCost08");
      expect(details.sheet).not.toHaveProperty("youSaveSpend");
    }
  });
  it("labels nested maintenance costs and depreciation assumptions illustrative", () => {
    for (const id of supportedSpecIds) {
      const { sheet, numericSources } = getSpecDetails(id);
      expect(sheet.maintenance.map(m => m.atMiles)).toEqual([5000, 10000, 30000, 60000, 90000]);
      for (const [index, task] of sheet.maintenance.entries()) {
        expect(task.label).toContain("Illustrative");
        expect(task.costUsd).toBeGreaterThan(0);
        expect(task.repeatEveryMiles).toBeGreaterThan(0);
        expect(numericSources[`maintenance.${index}.costUsd`].label).toBe("illustrative");
      }
      const curve = sheet.depreciation.retainedByYear;
      expect(curve).toHaveLength(5);
      for (let i = 0; i < curve.length; i++) {
        expect(curve[i]).toBeGreaterThan(0);
        expect(curve[i]).toBeLessThanOrEqual(i === 0 ? 1 : curve[i - 1]);
        expect(numericSources[`depreciation.retainedByYear.${i}`].label).toBe("illustrative");
      }
    }
  });
  it("keeps registry values and per-field sources consistent with the spec sheets", () => {
    for (const entry of getRegistryEntries()) {
      const sheet = getSpecs(entry.id);
      expect([entry.mpg, entry.seats, entry.cargoCuFt, entry.msrp]).toEqual([sheet.mpgCombined, sheet.seats, sheet.cargoCuFt, sheet.msrp]);
      for (const key of ["seats", "cargoCuFt", "msrp"] as const) expect(entry.fieldSources[key]).toBe(sheet.sources[key]);
      expect(entry.specSources.join(" ")).toContain("data/specs.ts");
    }
  });
  it("provides strict model/drivetrain descriptors for decoder integration", () => {
    const entries = getSpecEntries();
    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      const merged = mergeVehicleSpecs({ vehicle: { make: entry.make, model: entry.model, year: entry.year,
        trim: entry.trim, powertrain: entry.powertrain }, fieldSources: {}, driveType: entry.driveType }, entries);
      expect(merged.vehicle.mpg).toBe(entry.sheet.mpgCombined);
      expect(merged.fieldSources.mpg).toBe("sourced");
      expect(merged.fieldSources.cargoCuFt).toBe("synthetic");
    }
  });
  it("works without network and isolates returned sheets and source records", () => {
    const fetch = vi.fn(() => { throw new Error("Network disabled"); });
    vi.stubGlobal("fetch", fetch);
    try {
      const first = getSpecDetails("camry-2022-se");
      first.sheet.maintenance[0].costUsd = 999;
      first.sheet.depreciation.retainedByYear[0] = 0;
      first.numericSources.mpgCombined.source = "changed";
      const next = getSpecDetails("camry-2022-se");
      expect(next.sheet.maintenance[0].costUsd).toBe(60);
      expect(next.sheet.depreciation.retainedByYear[0]).toBe(0.85);
      expect(next.numericSources.mpgCombined.source).not.toBe("changed");
      expect(fetch).not.toHaveBeenCalled();
      expect(() => getSpecs("toString")).toThrow("No spec sheet");
      expect(() => getSpecs("unknown")).toThrow("No spec sheet");
    } finally { vi.unstubAllGlobals(); }
  });
});
