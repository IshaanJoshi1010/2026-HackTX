import { afterEach, describe, expect, it, vi } from "vitest";
import { createVehicleIdentifier, decodeVin, identifyVehicle, mergeVehicleSpecs, NHTSA_BASE_URL, type FetchLike, type SpecEntry } from "./decode";
import { IdentifyResultSchema } from "../contracts/schemas";
import { camryVehicle } from "./fixtures/vehicles";
import { specFixtures } from "./fixtures/specs";

// Test-only fabricated response identity. Never registered as a real sample/listing VIN.
const vin = "1M8GDM9AXKP042788";
const record = { VIN: vin, Make: "TOYOTA", Model: "Camry", ModelYear: "2022", Trim: "SE",
  FuelTypePrimary: "Gasoline", ElectrificationLevel: "Not Electrified", EngineCylinders: "4",
  DisplacementL: "2.5", DriveType: "FWD/Front-Wheel Drive", ErrorCode: "0" };
// Mock transport layer: every test response is supplied locally, with no network access.
const transport = (value: unknown = { Results: [record] }) => vi.fn<FetchLike>().mockResolvedValue({ ok: true, status: 200, json: async () => value });
const sheet: SpecEntry = { make: "Toyota", model: "Camry", year: 2022, trim: "SE", powertrain: "gas",
  driveType: record.DriveType, sheet: specFixtures[camryVehicle.id], source: "test-only illustrative spec fixture" };

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("VIN identification routing", () => {
  it("rejects invalid VINs before any request or registry lookup", async () => {
    const fetch = transport();
    expect(await createVehicleIdentifier({ fetch })("bad")).toEqual({ status: "invalid", reason: "length" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("returns registered primary and backup entries offline without fetch, isolated from callers", async () => {
    const backup = "1HGCM82633A004352";
    const fetch = vi.fn<FetchLike>().mockRejectedValue(new Error("network disabled"));
    const registry = { [vin]: { ...camryVehicle, vin }, [backup]: { ...camryVehicle, vin: backup } };
    const identify = createVehicleIdentifier({ registry, fetch });
    for (const id of [vin, backup]) {
      const result = await identify(id.toLowerCase(), { offline: true });
      expect(IdentifyResultSchema.safeParse(result).success).toBe(true);
      expect(result.status).toBe("ok");
      if (result.status !== "ok") throw new Error("Expected saved vehicle");
      expect(result.decodeState).toBe("registry");
      expect(result.vehicle.vin).toBe(id);
      expect(result.vehicle.matchStatus).toBe("representative");
      result.vehicle.specSources.push("mutated");
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(registry[vin].specSources).not.toContain("mutated");
  });
  it("never certifies an exact entry before C2 verification, or accepts an invalid/mismatched entry", async () => {
    const exact = await createVehicleIdentifier({ registry: { [vin]: { ...camryVehicle, vin, matchStatus: "exact" } } })(vin);
    expect(exact.status === "ok" && exact.vehicle.matchStatus).toBe("representative");
    const mismatch = await createVehicleIdentifier({ registry: { [vin]: { ...camryVehicle, vin: "1HGCM82633A004352" } } })(vin);
    expect(mismatch.status).toBe("unsupported");
  });
  it("unknown offline VIN returns explicit decode-unavailable state with only known input", async () => {
    const fetch = transport();
    const result = await createVehicleIdentifier({ fetch })(vin, { offline: true });
    expect(result.status).toBe("unsupported");
    if (result.status !== "unsupported") throw new Error("Expected partial");
    expect(result.reason).toContain("Decode unavailable");
    expect(result.partial).not.toHaveProperty("make");
    expect(fetch).not.toHaveBeenCalled();
    expect(await identifyVehicle(vin, { offline: true })).toEqual(result);
  });
  it("keeps known identity/specs but does not invent paint, asset, VIN history or mileage", async () => {
    const fetch = transport();
    const result = await createVehicleIdentifier({ fetch, specs: [sheet] })(vin);
    expect(IdentifyResultSchema.safeParse(result).success).toBe(true);
    expect(result.status).toBe("unsupported");
    if (result.status !== "unsupported") throw new Error("Expected incomplete vehicle");
    expect(result.reason).toContain("details incomplete");
    expect(result.partial).toMatchObject({ make: "TOYOTA", model: "Camry", year: 2022, trim: "SE", powertrain: "gas", matchStatus: "representative", mpg: 32 });
    for (const key of ["paint", "paintCode", "modelAsset", "mileage", "history", "finance"]) expect(result.partial).not.toHaveProperty(key);
    expect(fetch).toHaveBeenCalledWith(`${NHTSA_BASE_URL}${vin}?format=json`, { signal: expect.any(AbortSignal) });
  });
  it("marks unknown models unsupported with their decoded identity", async () => {
    const result = await createVehicleIdentifier({ fetch: transport({ Results: [{ ...record, Make: "HONDA", Model: "Civic" }] }) })(vin);
    expect(result.status).toBe("unsupported");
    if (result.status === "unsupported") expect(result.partial).toMatchObject({ make: "HONDA", model: "Civic", matchStatus: "unsupported" });
  });
});

describe("NHTSA adapter", () => {
  it("maps identity and source evidence; no arbitrary raw fields are copied", async () => {
    const result = await decodeVin(vin, { fetch: transport({ Results: [{ ...record, paint: "fake", mileage: 12345 }] }) });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.decoded.fieldSources).toMatchObject({ vin: "user", make: "sourced", year: "sourced", powertrain: "sourced" });
    expect(result.decoded.vehicle.specSources?.some(s => s.includes("DisplacementL=2.5"))).toBe(true);
    expect(result.decoded.vehicle).not.toHaveProperty("paint");
    expect(result.decoded.vehicle).not.toHaveProperty("mileage");
  });
  it("does not infer gas powertrain from missing electrification data", async () => {
    const result = await decodeVin(vin, { fetch: transport({ Results: [{ ...record, ElectrificationLevel: "", ModelYear: "unknown", Trim: "Not Applicable" }] }) });
    if (!result.ok) throw new Error(result.reason);
    expect(result.decoded.vehicle).not.toHaveProperty("powertrain");
    expect(result.decoded.vehicle).not.toHaveProperty("year");
    expect(result.decoded.vehicle).not.toHaveProperty("trim");
  });
  it("recognizes a hybrid but never maps BEV or PHEV to gas", async () => {
    for (const level of ["HEV (Hybrid Electric Vehicle)", "BEV (Battery Electric Vehicle)", "PHEV (Plug-in Hybrid Electric Vehicle)"]) {
      const result = await decodeVin(vin, { fetch: transport({ Results: [{ ...record, ElectrificationLevel: level }] }) });
      if (!result.ok) throw new Error(result.reason);
      expect(result.decoded.vehicle.powertrain).toBe(level.startsWith("HEV") ? "hybrid" : undefined);
    }
  });
  it.each([{ Results: [] }, { Results: [{}] }, null, { Results: [{ ...record, VIN: "1HGCM82633A004352" }] }, { Results: [{ ...record, ErrorCode: "1" }] }])("handles malformed, mismatched or error responses", async payload => {
    expect((await decodeVin(vin, { fetch: transport(payload) })).ok).toBe(false);
  });
  it("handles HTTP, JSON and network failures", async () => {
    const responses: FetchLike[] = [
      async () => ({ ok: false, status: 503, json: async () => null }),
      async () => ({ ok: true, status: 200, json: async () => { throw new Error("bad json"); } }),
      async () => { throw new Error("offline"); },
    ];
    for (const fetch of responses) {
      const result = await createVehicleIdentifier({ fetch })(vin);
      expect(result.status === "unsupported" && result.reason).toContain("Decode unavailable");
    }
  });
  it("enforces the 3 second deadline even when the transport ignores abort", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<FetchLike>().mockImplementation(() => new Promise(() => {}));
    const pending = createVehicleIdentifier({ fetch })(vin);
    await vi.advanceTimersByTimeAsync(3000);
    const result = await pending;
    expect(result.status === "unsupported" && result.reason).toContain("timed out");
    expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
  it("also times out a hung response body and supports a shorter deadline", async () => {
    vi.useFakeTimers();
    const fetch: FetchLike = async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) });
    const pending = decodeVin(vin, { fetch, timeoutMs: 10 });
    await vi.advanceTimersByTimeAsync(10);
    expect(await pending).toEqual({ ok: false, reason: "Decode unavailable: NHTSA timed out" });
  });
  it.each([0, -1, Infinity, NaN])("rejects an invalid timeout %s", async timeoutMs => {
    const fetch = transport();
    expect((await decodeVin(vin, { fetch, timeoutMs })).ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("spec merge", () => {
  async function decoded() {
    const result = await decodeVin(vin, { fetch: transport() });
    if (!result.ok) throw new Error(result.reason);
    return result.decoded;
  }
  it("fills only missing fields, preserving identity and source labels without mutating inputs", async () => {
    const input = await decoded();
    const before = structuredClone(input);
    const merged = mergeVehicleSpecs(input, [sheet]);
    expect(merged.vehicle).toMatchObject({ mpg: 32, seats: 5, cargoCuFt: 15, msrp: 28000 });
    expect(merged.fieldSources).toMatchObject({ mpg: "sourced", seats: "illustrative", cargoCuFt: "illustrative", msrp: "illustrative" });
    expect(merged.vehicle.specSources?.some(s => s.startsWith("illustrative: cargoCuFt"))).toBe(true);
    expect(input).toEqual(before);
    input.vehicle.mpg = 99;
    expect(mergeVehicleSpecs(input, [sheet]).vehicle.mpg).toBe(99);
  });
  it("does not borrow specs across year, trim, model, powertrain or drivetrain", async () => {
    for (const wrong of [{ year: 2023 }, { trim: "LE" }, { model: "RAV4" }, { powertrain: "hybrid" as const }, { driveType: "AWD/All-Wheel Drive" }]) {
      expect(mergeVehicleSpecs(await decoded(), [{ ...sheet, ...wrong }]).vehicle).not.toHaveProperty("mpg");
    }
    expect(mergeVehicleSpecs(await decoded(), [sheet, sheet]).vehicle).not.toHaveProperty("mpg");
    expect(mergeVehicleSpecs(await decoded(), []).vehicle).not.toHaveProperty("mpg");
  });
});
