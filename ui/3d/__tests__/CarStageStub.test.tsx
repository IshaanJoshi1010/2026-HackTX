import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CarStageProps } from "../types";
import type { VehicleConfig } from "@/contracts";

// jsdom cannot render WebGL. Exercise the real component lifecycle and DOM;
// canvas rendering is checked separately in a browser.
vi.mock("@react-three/fiber", () => ({ Canvas: () => <div data-testid="canvas" />, useThree: vi.fn() }));
vi.mock("@react-three/drei", () => ({ OrbitControls: () => null }));
import { CarStageStub, preloadCars } from "../CarStageStub";

const camry: VehicleConfig = {
  id: "camry-2022-se", make: "Toyota", model: "Camry", year: 2022, trim: "SE", powertrain: "gas",
  paint: "", mpg: 32, seats: 5, cargoCuFt: 15.1, msrp: 26000,
  modelAsset: "/models/camry-v80.glb", matchStatus: "representative", specSources: [],
};
const rav4 = { ...camry, id: "rav4-hybrid-2024-xle", model: "RAV4" };
const makeProps = (patch: Partial<CarStageProps> = {}): CarStageProps => ({
  vehicle: camry, phase: "reveal", viewMode: "solid", quality: "high", reducedMotion: false,
  resetCameraSignal: 0, skipSignal: 0, replaySignal: 0,
  onRevealStage: vi.fn(), onTransitionComplete: vi.fn(), onModelStatus: vi.fn(), ...patch,
});
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("CarStageStub contract", () => {
  it("fires each reveal stage at the frozen boundary and reports readiness", () => {
    const props = makeProps();
    render(<CarStageStub {...props} />);
    expect(props.onModelStatus).toHaveBeenCalledWith({ vehicleId: camry.id, ready: true });
    expect(screen.getByText("Representative model")).toBeTruthy();
    advance(0);
    expect(props.onRevealStage).toHaveBeenLastCalledWith("converge");
    advance(1999);
    expect(props.onRevealStage).toHaveBeenCalledTimes(1);
    advance(1);
    expect(props.onRevealStage).toHaveBeenLastCalledWith("pointcloud");
    advance(500);
    expect(props.onRevealStage).toHaveBeenLastCalledWith("wireframe");
    advance(500);
    expect(props.onRevealStage).toHaveBeenLastCalledWith("solid");
    advance(1000);
    expect(vi.mocked(props.onRevealStage).mock.calls.map(([stage]) => stage)).toEqual(["converge", "pointcloud", "wireframe", "solid", "done"]);
  });

  it("skip flushes remaining stages once and cancels pending timers", () => {
    const props = makeProps();
    const { rerender } = render(<CarStageStub {...props} />);
    advance(2200);
    rerender(<CarStageStub {...props} skipSignal={1} />);
    expect(vi.mocked(props.onRevealStage).mock.calls.map(([stage]) => stage)).toEqual(["converge", "pointcloud", "wireframe", "solid", "done"]);
    advance(5000);
    rerender(<CarStageStub {...props} skipSignal={2} />);
    expect(props.onRevealStage).toHaveBeenCalledTimes(5);
  });

  it("reduced motion completes immediately; replay restarts once", () => {
    const props = makeProps({ reducedMotion: true });
    const { rerender } = render(<CarStageStub {...props} />);
    advance(0);
    expect(props.onRevealStage).toHaveBeenCalledTimes(5);
    rerender(<CarStageStub {...props} replaySignal={1} />);
    advance(0);
    expect(props.onRevealStage).toHaveBeenCalledTimes(10);
  });

  it("parent callback changes do not restart the timeline", () => {
    const props = makeProps();
    const { rerender } = render(<CarStageStub {...props} />);
    advance(1000);
    const callback = vi.fn();
    rerender(<CarStageStub {...props} onRevealStage={callback} viewMode="wireframe" />);
    advance(1000);
    expect(callback).toHaveBeenCalledExactlyOnceWith("pointcloud");
  });

  it("transitions at 1.8 seconds and displays transitionTo", () => {
    const props = makeProps({ phase: "transition", transitionTo: rav4 });
    render(<CarStageStub {...props} />);
    advance(1799);
    expect(props.onTransitionComplete).not.toHaveBeenCalled();
    expect(screen.getByText("Camry")).toBeTruthy();
    advance(1);
    expect(props.onTransitionComplete).toHaveBeenCalledTimes(1);
    expect(screen.getByText("RAV4")).toBeTruthy();
    advance(5000);
    expect(props.onTransitionComplete).toHaveBeenCalledTimes(1);
  });

  it("skips a transition and reports invalid transition input", () => {
    const props = makeProps({ phase: "transition", transitionTo: rav4 });
    const { rerender } = render(<CarStageStub {...props} />);
    advance(500);
    rerender(<CarStageStub {...props} skipSignal={1} />);
    expect(props.onTransitionComplete).toHaveBeenCalledTimes(1);
    expect(screen.getByText("RAV4")).toBeTruthy();
    rerender(<CarStageStub {...props} transitionTo={undefined} skipSignal={1} />);
    expect(props.onModelStatus).toHaveBeenLastCalledWith(expect.objectContaining({ ready: false, error: expect.any(String) }));
  });

  it("cancels callbacks on unmount and phase changes", () => {
    const props = makeProps();
    const { rerender, unmount } = render(<CarStageStub {...props} />);
    advance(0);
    rerender(<CarStageStub {...props} phase="interactive" />);
    advance(5000);
    expect(props.onRevealStage).toHaveBeenCalledTimes(1);
    rerender(<CarStageStub {...props} replaySignal={1} />);
    advance(0);
    unmount();
    advance(5000);
    expect(props.onRevealStage).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preload resolves without network access", async () => {
    await expect(preloadCars([camry, rav4])).resolves.toBeUndefined();
  });
});
