import { describe, expect, it } from "vitest";
import { USE_MOCKS, mockFingerprint, mockedModules } from "./index";

describe("the mock switches", () => {
  it("data, sim, decision and the AI are real: nothing in the app runs on a stand-in for them", () => {
    expect(USE_MOCKS.data).toBe(false);
    expect(USE_MOCKS.sim).toBe(false);
    expect(USE_MOCKS.decision).toBe(false);
    expect(USE_MOCKS.ai).toBe(false);
  });

  it("only the 3D stage is a stand-in, and only here: jsdom has no WebGL", () => {
    expect(process.env.NODE_ENV).toBe("test");
    expect(mockedModules()).toEqual(["car"]);
    expect(mockFingerprint()).toBe("car");
  });
});
