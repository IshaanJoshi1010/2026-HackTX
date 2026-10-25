import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { CarStageProps } from "../types";

const bridge = vi.hoisted(() => ({ busy: undefined as ((busy: boolean) => void) | undefined, props: undefined as CarStageProps | undefined, ready: undefined as (() => void) | undefined }));
vi.mock("@react-three/fiber", () => ({ Canvas: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("../Scene", () => ({ Scene: ({ props, onReady, onBusyChange }: { props: CarStageProps; onReady: () => void; onBusyChange: (busy: boolean) => void }) => { bridge.busy = onBusyChange; bridge.props = props; bridge.ready = onReady; return null; } }));
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

it("presentation controls honor reduced motion and retain skip/reveal callbacks", () => {
  const config = props(); const view = render(<CarStage {...config} />);
  const spin = screen.getByRole("button", { name: "Auto-rotate" });
  fireEvent.click(spin); expect(spin).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "Side" }));
  expect(spin).toHaveAttribute("aria-pressed", "false");
  view.rerender(<CarStage {...config} reducedMotion />);
  expect(spin).toBeDisabled();
  expect(config.onRevealStage).not.toHaveBeenCalled();
  view.rerender(<CarStage {...config} phase="transition" transitionTo={config.vehicle} />);
  act(() => bridge.busy!(true));
  expect(screen.getByRole("button", { name: "Front" })).toBeDisabled();
  act(() => bridge.busy!(false));
  expect(screen.getByRole("button", { name: "Front" })).toBeEnabled();
});

it("passes reveal lifecycle to the loaded scene, without a competing DOM timer", () => {
  const config = props(); render(<CarStage {...config} />);
  act(() => vi.advanceTimersByTime(5000));
  expect(config.onRevealStage).not.toHaveBeenCalled();
  act(() => bridge.props!.onRevealStage("converge"));
  expect(config.onRevealStage).toHaveBeenCalledWith("converge");
  expect(vi.getTimerCount()).toBe(0);
});
it("passes skip and reports a failed asset without claiming readiness", () => {
  const config = props(); const { rerender } = render(<CarStage {...config} />);
  rerender(<CarStage {...config} skipSignal={1} />);
  expect(bridge.props!.skipSignal).toBe(1);
  act(() => bridge.props!.onModelStatus({ vehicleId: "camry", ready: false, error: "Fetch failed" }));
  expect(screen.getByRole("status").textContent).toContain("Fetch failed");
  expect(config.onRevealStage).not.toHaveBeenCalled();
});
