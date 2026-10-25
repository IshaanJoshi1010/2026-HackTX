import { expect, it } from "vitest";
import { stagePixelRatio } from "../pixelBudget";

it("limits full-HD supersampling while retaining detail in smaller stages", () => {
  expect(stagePixelRatio(1920,1080,2)).toBe(1);
  expect(stagePixelRatio(1280,720,2)).toBe(1.5);
  expect(stagePixelRatio(640,360,3)).toBe(2);
  expect(stagePixelRatio(1024,768,1)).toBe(1);
  expect(stagePixelRatio(3840,2160,2)).toBe(0.5);
  expect(stagePixelRatio(7680,4320,2)).toBe(0.25);
  expect(stagePixelRatio(0,0,1.5)).toBe(1.5);
});
