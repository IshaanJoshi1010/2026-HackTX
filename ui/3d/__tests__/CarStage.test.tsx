import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { CarStageProps } from "../types";

const bridge = vi.hoisted(() => ({ props: undefined as CarStageProps | undefined, ready: undefined as (() => void) | undefined }));
vi.mock("@react-three/fiber", () => ({ Canvas: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("../Scene", () => ({ Scene: ({ props, onReady }: { props: CarStageProps; onReady: () => void }) => { bridge.props = props; bridge.ready = onReady; return null; } }));
vi.mock("../CarStageStub", () => ({ CarStageStub: () => null }));
import { CarStage } from "../CarStage";

function props(): CarStageProps {
  return {
    vehicle: { id: "camry", make: "Toyota", model: "Camry", year: 2022, trim: "SE", powertrain: "gas", paint: "", mpg: 32, seats: 5, cargoCuFt: 15, msrp: 26000, modelAsset: "/fixture.glb", matchStatus: "representative", specSources: [] },
    phase: "reveal", viewMode: "solid", quality: "high", reducedMotion: false, resetCameraSignal: 0, skipSignal: 0, replaySignal: 0,
    onRevealStage: vi.fn(), onTransitionComplete: vi.fn(), onModelStatus: vi.fn(),
  };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

it("waits for real asset readiness before starting the reveal callback clock", () => {
  const config = props();
  render(<CarStage {...config} />);
  act(() => vi.advanceTimersByTime(5000));
  expect(config.onRevealStage).not.toHaveBeenCalled();
  act(() => { bridge.props!.onModelStatus({ vehicleId: "camry", ready: true }); bridge.ready!(); });
  expect(config.onRevealStage).toHaveBeenLastCalledWith("converge");
  act(() => vi.advanceTimersByTime(4000));
  expect(vi.mocked(config.onRevealStage).mock.calls.map(([stage]) => stage)).toEqual(["converge", "pointcloud", "wireframe", "solid", "done"]);
});

it("remembers skip while loading and reports load failure without claiming readiness", () => {
  const config = props();
  const { rerender } = render(<CarStage {...config} />);
  rerender(<CarStage {...config} skipSignal={1} />);
  act(() => bridge.props!.onModelStatus({ vehicleId: "camry", ready: false, error: "Fetch failed" }));
  expect(screen.getByRole("status").textContent).toContain("Fetch failed");
  expect(config.onRevealStage).not.toHaveBeenCalled();
  act(() => { bridge.props!.onModelStatus({ vehicleId: "camry", ready: true }); bridge.ready!(); });
  expect(config.onRevealStage).toHaveBeenCalledTimes(5);
  act(() => vi.advanceTimersByTime(5000));
  expect(config.onRevealStage).toHaveBeenCalledTimes(5);
});

it("cleans up reveal callbacks on unmount", () => {
  const config = props();
  const { unmount } = render(<CarStage {...config} />);
  act(() => bridge.ready!());
  unmount();
  act(() => vi.advanceTimersByTime(5000));
  expect(config.onRevealStage).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
