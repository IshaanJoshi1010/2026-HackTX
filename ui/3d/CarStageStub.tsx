"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useRef, type ComponentRef, type JSX } from "react";
import type { VehicleConfig } from "@/contracts";
import type { CarStageProps } from "./types";
import { useStubTimeline } from "./useStubTimeline";

function StubScene({ viewMode, resetCameraSignal }: Pick<CarStageProps, "viewMode" | "resetCameraSignal">) {
  const camera = useThree((state) => state.camera);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  useEffect(() => {
    camera.position.set(4.8, 1.6, 5.6);
    controls.current?.target.set(0, 0.7, 0);
    controls.current?.update();
  }, [camera, resetCameraSignal]);
  return <>
    <ambientLight intensity={0.8} />
    <directionalLight position={[3, 6, 4]} intensity={2} />
    {viewMode === "points" ? <points position={[0, 0.7, 0]}>
      <boxGeometry args={[4.6, 1.4, 1.8, 24, 8, 10]} />
      <pointsMaterial color="#27e1ff" size={0.025} />
    </points> : <mesh position={[0, 0.7, 0]}>
      <boxGeometry args={[4.6, 1.4, 1.8]} />
      <meshStandardMaterial color="#8a8c90" roughness={0.5} wireframe={viewMode === "wireframe"} />
    </mesh>}
    <OrbitControls ref={controls} target={[0, 0.7, 0]} enableDamping dampingFactor={0.08}
      minDistance={3.5} maxDistance={9} maxPolarAngle={1.5} />
  </>;
}

/** Integration placeholder; ready means the stub is ready, not a downloaded GLB. */
export function CarStageStub(props: CarStageProps): JSX.Element {
  const visibleVehicle = useStubTimeline(props);
  return <section aria-label="Vehicle 3D preview" style={{ position: "relative", width: "100%", height: "100%", minHeight: 320, background: "#111214" }}>
    <Canvas camera={{ position: [4.8, 1.6, 5.6], fov: 35 }} dpr={props.quality === "low" ? 1 : [1, 2]}
      fallback={<p>3D preview is unavailable. You can continue using the app.</p>}>
      <StubScene viewMode={props.viewMode} resetCameraSignal={props.resetCameraSignal} />
    </Canvas>
    <div style={{ position: "absolute", top: 16, left: 16, color: "#eee", pointerEvents: "none" }}>
      <strong>{visibleVehicle.model}</strong>
      <div>{visibleVehicle.matchStatus === "representative" ? "Representative model" : visibleVehicle.matchStatus === "unsupported" ? "Unsupported model" : "Exact model"}</div>
      <small>Integration stub</small>
    </div>
  </section>;
}

export async function preloadCars(_vehicles: VehicleConfig[]): Promise<void> {
  // No model assets are loaded by the integration stub.
  void _vehicles;
}

export type { CarStageProps } from "./types";
