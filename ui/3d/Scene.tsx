"use client";

import { OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useRef, type ComponentRef } from "react";
import type { CarStageProps } from "./types";
import { VehicleModel } from "./VehicleModel";
import { RendererDiagnostics } from "./diagnostics";
import { ContactShadows } from "./ContactShadows";
import { StudioEnvironment } from "./StudioEnvironment";

export function Scene({ props, onReady }: { props: CarStageProps; onReady: () => void }) {
  const camera = useThree((state) => state.camera);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  useEffect(() => {
    camera.position.set(4.8, 1.6, 5.6);
    controls.current?.target.set(0, 0.7, 0);
    controls.current?.update();
  }, [camera, props.resetCameraSignal]);
  return <>
    {process.env.NODE_ENV !== "production" && <RendererDiagnostics />}
    <color attach="background" args={["#101114"]} />
    <fog attach="fog" args={["#101114", 7, 22]} />
    <StudioEnvironment />
    <hemisphereLight args={["#ffffff", "#26272b", 0.22]} />
    <directionalLight position={[-3, 7, 4]} intensity={1.5} castShadow shadow-mapSize={[props.quality === "low" ? 512 : 2048, props.quality === "low" ? 512 : 2048]} shadow-radius={6} shadow-bias={-0.00015} shadow-normalBias={0.015} shadow-camera-left={-4} shadow-camera-right={4} shadow-camera-top={4} shadow-camera-bottom={-4} shadow-camera-near={0.5} shadow-camera-far={18} />
    <directionalLight position={[4, 3, -5]} color="#e6ebff" intensity={0.7} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.006, 0]} receiveShadow userData={{ contactIgnore: true }}>
      <planeGeometry args={[200, 200]} /><meshStandardMaterial color="#101114" roughness={0.9} envMapIntensity={0.25} />
    </mesh>
    <VehicleModel props={props} onReady={onReady} />
    <ContactShadows low={props.quality === "low"} />
    <OrbitControls ref={controls} target={[0, 0.7, 0]} enableDamping dampingFactor={0.08} minDistance={3.5} maxDistance={9} maxPolarAngle={1.5} />
  </>;
}
