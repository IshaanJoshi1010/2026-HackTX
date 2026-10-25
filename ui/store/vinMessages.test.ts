import { beforeEach, describe, expect, it, vi } from "vitest";
import { data } from "@/ui/mocks";
import { SUPPORTED_CARS, vinFailureMessage, vinReason } from "./vinMessages";
import { resetForkStoreForTests, useForkStore } from "./useForkStore";

// Every reason data/decode.ts can give for a VIN that does not open a car.
const LOOKUP_FAILED = [
  "Decode unavailable: NHTSA HTTP 500",
  "Decode unavailable: NHTSA timed out",
  "Decode unavailable: malformed NHTSA response",
  "Decode unavailable: NHTSA returned a different VIN",
  "Decode unavailable: NHTSA decoder code 7",
  "Decode unavailable: NHTSA network or response failure",
  "Decode unavailable: offline and VIN not in registry",
  "Decode unavailable: invalid timeout",
];
const OTHER = [
  "Vehicle is outside Fork's supported models",
  "Vehicle is outside Fork's supported models or identity is incomplete",
  "Supported model decoded; vehicle details incomplete. Listing, assets and sourced specs are still required",
  "Saved registry entry is invalid",
  "something nobody planned for",
];

const messages = [...LOOKUP_FAILED, ...OTHER].map((reason) => [reason, vinFailureMessage({ status: "unsupported", reason })] as const);

describe("plain VIN failure messages", () => {
  it.each(messages)("%s", (_reason, message) => {
    // none of the data layer's wording reaches the screen
    expect(message).not.toMatch(/NHTSA|HTTP|decoder|registry|Decode unavailable|timeout|\bcode \d/i);
    // it names both supported cars, so the person knows what to do next
    expect(message).toContain("2022 Toyota Camry SE");
    expect(message).toContain("2024 Toyota RAV4 Hybrid XLE");
    // and never claims a match, exact or otherwise: a failed VIN opens nothing
    expect(message).not.toMatch(/exact|match|verified/i);
    expect(message).not.toContain("—");
  });

  it("tells a failed lookup from a car Fork does not model", () => {
    expect(vinFailureMessage({ status: "unsupported", reason: LOOKUP_FAILED[0] })).toMatch(/couldn't look that VIN up right now/);
    expect(vinFailureMessage({ status: "unsupported", reason: LOOKUP_FAILED[0] })).toMatch(/Sample cars or Select model/);
    expect(vinFailureMessage({ status: "unsupported", reason: OTHER[0] })).toMatch(/car Fork doesn't model yet/);
    expect(vinFailureMessage({ status: "unsupported", reason: OTHER[2] })).toMatch(/Try the sample car for that model/);
  });

  it("keeps the format messages for VINs that are not shaped like VINs", () => {
    expect(vinFailureMessage({ status: "invalid", reason: "length" })).toBe("A VIN has 17 characters.");
    expect(vinReason("check_digit")).toBe("That VIN's check digit does not add up.");
    expect(vinReason("???")).toBe("That doesn't look like a valid VIN.");
  });

  it("the list of cars is the two Fork supports", () => {
    expect(SUPPORTED_CARS).toBe("a 2022 Toyota Camry SE and a 2024 Toyota RAV4 Hybrid XLE");
  });
});

describe("in the store", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    resetForkStoreForTests();
    useForkStore.setState({ hydrated: true });
  });

  it.each([...LOOKUP_FAILED.slice(0, 3), OTHER[0]])("%s: no twin, the plain message, and the app is usable again", async (reason) => {
    vi.spyOn(data, "identifyVehicle").mockResolvedValue({ status: "unsupported", partial: {}, reason } as Awaited<ReturnType<typeof data.identifyVehicle>>);
    await useForkStore.getState().actions.startFromVin("1HGCM82633A004352");
    const s = useForkStore.getState();
    expect(s.twin).toBeNull();
    expect(s.phase).toBe("landing");
    expect(s.ui.busy).toBe("idle");
    expect(s.error).toBe(vinFailureMessage({ status: "unsupported", reason }));
    expect(s.error).not.toContain(reason);
  });
});
