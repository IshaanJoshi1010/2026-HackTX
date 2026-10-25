import { expect, it } from "vitest";
import { smootherStep } from "../animationMath";

it("clamps fades and joins stationary endpoints without a velocity jump", () => {
  expect(smootherStep(-1)).toBe(0); expect(smootherStep(2)).toBe(1);
  expect(smootherStep(0.5)).toBe(0.5);
  const step = 0.001;
  expect(smootherStep(step) / step).toBeLessThan(0.0001);
  expect((1 - smootherStep(1 - step)) / step).toBeLessThan(0.0001);
  for (let i = 1; i <= 100; i++) {
    expect(smootherStep(i / 100)).toBeGreaterThanOrEqual(smootherStep((i - 1) / 100));
    expect(smootherStep(i / 100) + smootherStep(1 - i / 100)).toBeCloseTo(1);
  }
});
