import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CarStageProps } from "../types";
const bridge = vi.hoisted(() => ({ select: vi.fn(), complete: undefined as (() => void) | undefined }));
vi.mock("@react-three/fiber", () => ({ useFrame: () => {}, useThree: () => ({}) }));
vi.mock("../VehicleController", () => ({ VehicleController: class {
  group = {}; dispose = vi.fn(); skip = vi.fn();
  select(...args: unknown[]) { bridge.select(...args); bridge.complete = args[4] as () => void; }
} }));
import { VehicleModel } from "../VehicleModel";
// jsdom stands in for the R3F host group; test the hook lifecycle, not WebGL.
beforeEach(() => { Object.defineProperty(HTMLElement.prototype, "add", { configurable: true, value: vi.fn() }); });
afterEach(() => { cleanup(); Reflect.deleteProperty(HTMLElement.prototype, "add"); vi.clearAllMocks(); });
it("keeps the rendered destination when the parent adopts it after transition completion", () => {
  const vehicle = { id: "a", paint: "#111111", modelAsset: "/a.glb" } as CarStageProps["vehicle"];
  const destination = { ...vehicle, id: "b", modelAsset: "/b.glb" };
  const props: CarStageProps = { vehicle, transitionTo: destination, phase: "transition", quality: "high", viewMode: "solid", reducedMotion: false, replaySignal: 0, resetCameraSignal: 0, skipSignal: 0, onRevealStage: vi.fn(), onTransitionComplete: vi.fn(), onModelStatus: vi.fn() };
  const view = render(<VehicleModel props={props} onReady={vi.fn()} onBusy={vi.fn()} />);
  expect(bridge.select).toHaveBeenCalledTimes(1);
  act(() => bridge.complete!());
  view.rerender(<VehicleModel props={{ ...props, phase: "interactive", vehicle: destination }} onReady={vi.fn()} onBusy={vi.fn()} />);
  expect(bridge.select).toHaveBeenCalledTimes(1);
  view.rerender(<VehicleModel props={{ ...props, phase: "interactive", vehicle: { ...destination, paint: "#ff0000" } }} onReady={vi.fn()} onBusy={vi.fn()} />);
  expect(bridge.select).toHaveBeenCalledTimes(2);
});
