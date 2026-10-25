"use client";

import { Canvas } from "@react-three/fiber";
import { Component, useCallback, useEffect, useLayoutEffect, useRef, useState, type JSX, type ReactNode } from "react";
import { ACESFilmicToneMapping } from "three";
import type { CarStageProps } from "./types";
import { Scene } from "./Scene";

class CanvasErrorBoundary extends Component<{ children: ReactNode; onError: (message: string) => void }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  componentDidCatch(error: Error) { this.props.onError(error.message); }
  render() { return this.state.error ? <p>3D preview unavailable. You can continue using the app.</p> : this.props.children; }
}

export function CarStage(props: CarStageProps): JSX.Element {
  const callbacks = useRef(props);
  useLayoutEffect(() => { callbacks.current = props; });
  const [modelStatus, setModelStatus] = useState<{ vehicleId: string; ready: boolean; error?: string }>({ vehicleId: props.vehicle.id, ready: false });
  const [displayedVehicle, setDisplayedVehicle] = useState(props.vehicle);
  const ready = useCallback(() => {}, []);
  const report = useCallback((status: { vehicleId: string; ready: boolean; error?: string }) => {
    if (status.ready) {
      const active = callbacks.current;
      setDisplayedVehicle(active.transitionTo?.id === status.vehicleId && active.phase === "transition" ? active.transitionTo : active.vehicle);
    }
    setModelStatus(status); callbacks.current.onModelStatus(status);
  }, []);
  const target = props.phase === "transition" && props.transitionTo ? props.transitionTo : props.vehicle;
  const missingTarget = props.phase === "transition" && !props.transitionTo;
  useEffect(() => {
    if (missingTarget) callbacks.current.onModelStatus({ vehicleId: props.vehicle.id, ready: false, error: "transitionTo is required for a transition." });
  }, [missingTarget, props.vehicle.id]);
  const fallback = <p>3D preview is unavailable. You can continue using the app.</p>;
  return <section aria-label="Vehicle 3D preview" style={{ position: "relative", width: "100%", height: "100%", minHeight: 320, background: "#101114", color: "#eee" }}>
    <CanvasErrorBoundary onError={(error) => report({ vehicleId: target.id, ready: false, error })}>
      <Canvas camera={{ position: [4.8, 1.6, 5.6], fov: 35, near: 0.1, far: 50 }} dpr={props.quality === "low" ? 1 : [1, 2]} shadows="percentage" gl={{ antialias: true, toneMapping: ACESFilmicToneMapping }} fallback={fallback}>
        <Scene props={{ ...props, phase: missingTarget ? "interactive" : props.phase, onModelStatus: report }} onReady={ready} />
      </Canvas>
    </CanvasErrorBoundary>
    <div style={{ position: "absolute", top: 16, left: 16, right: 16, pointerEvents: "none", font: "12px system-ui" }}>
      <strong>{displayedVehicle.model}</strong>
      <div>{displayedVehicle.matchStatus === "exact" ? "" : displayedVehicle.matchStatus === "unsupported" ? "Unsupported model" : "Representative model"}</div>
      <div role="status">{missingTarget ? "Transition target is missing." : modelStatus.error ? modelStatus.ready ? modelStatus.error : `Model unavailable: ${modelStatus.error}` : !modelStatus.ready ? "Loading model..." : ""}</div>
    </div>
  </section>;
}

export { CarStageStub } from "./CarStageStub";
export { preloadCars } from "./assets";
export type { CarStageProps } from "./types";
