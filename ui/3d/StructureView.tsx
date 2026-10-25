"use client";

import { Html, Line } from "@react-three/drei";
import { useState } from "react";
import { useMaintenanceFindings, type CarComponent } from "./maintenance";
import type { VehicleConfig } from "@/contracts";

const parts: Record<CarComponent, { name: string; position: [number, number, number]; description: string }> = {
  engine: { name: "Powertrain", position: [1.35, 0.7, 0], description: "Engine and drive assembly" },
  battery: { name: "Battery", position: [-0.55, 0.48, 0], description: "Illustrative battery location" },
  brakes: { name: "Brakes", position: [1.35, 0.42, 0.86], description: "Front brake assembly" },
  tires: { name: "Tires", position: [-1.3, 0.42, 0.9], description: "Tires and wheel assemblies" },
};

/** Lightweight schematic, not an engineering cutaway of the licensed exterior GLB. */
export function StructureView({ vehicle }: { vehicle: VehicleConfig }) {
  const findings = useMaintenanceFindings(vehicle.id);
  const [picked, setPicked] = useState<CarComponent | null>(null);
  const selected = picked ?? findings[0]?.component ?? "engine";
  const part = parts[selected];
  const active = findings.filter(finding => finding.component === selected);
  const color = (id: CarComponent) => findings.some(finding => finding.component === id) ? "#ffb454" : selected === id ? "#9ce3f0" : "#657b89";
  const choose = (id: CarComponent) => (event: { stopPropagation(): void }) => { event.stopPropagation(); setPicked(id); };
  const label: [number, number, number] = [part.position[0] * 0.45, 1.9, part.position[2]];
  return <group userData={{ contactIgnore: true }}>
    {/* Sparse body rails provide context without dense exterior topology. */}
    {[-0.72, 0.72].map(z => <Line key={z} points={[[-2.1, 0.5, z], [-1.65, 0.95, z], [-0.85, 1.5, z], [0.45, 1.5, z], [1.15, 0.95, z], [2.1, 0.65, z]]} color="#536d7b" transparent opacity={0.55} lineWidth={1} />)}
    {/* Low-detail frame and axles preserve a readable vehicle silhouette. */}
    <mesh position={[0, 0.24, 0]}><boxGeometry args={[4.1, 0.13, 1.35]} /><meshStandardMaterial color="#263641" metalness={0.35} roughness={0.6} /></mesh>
    {[-1.3, 1.35].map(x => <mesh key={x} position={[x, 0.4, 0]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.055, 0.055, 1.85, 12]} /><meshStandardMaterial color="#71818c" /></mesh>)}
    <mesh position={parts.engine.position} onClick={choose("engine")}>
      <boxGeometry args={[0.85, 0.55, 0.85]} /><meshStandardMaterial color={color("engine")} metalness={0.45} roughness={0.35} />
    </mesh>
    {[0, 1, 2, 3].map(i => <mesh key={i} position={[1.08 + i * 0.18, 1, 0]}><boxGeometry args={[0.06, 0.08, 0.76]} /><meshStandardMaterial color="#a9b8c3" /></mesh>)}
    <mesh position={parts.battery.position} onClick={choose("battery")}>
      <boxGeometry args={vehicle.powertrain === "hybrid" ? [1.1, 0.23, 1] : [0.48, 0.32, 0.5]} /><meshStandardMaterial color={color("battery")} metalness={0.3} roughness={0.45} />
    </mesh>
    {[-1.3, 1.35].flatMap(x => [-0.9, 0.9].map(z => <group key={`${x}:${z}`} position={[x, 0.42, z]}>
      <mesh onClick={choose("tires")}><torusGeometry args={[0.31, 0.11, 10, 24]} /><meshStandardMaterial color={selected === "tires" || findings.some(f => f.component === "tires") ? color("tires") : "#25303a"} roughness={0.85} /></mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} onClick={choose("brakes")}><cylinderGeometry args={[0.23, 0.23, 0.07, 24]} /><meshStandardMaterial color={color("brakes")} metalness={0.6} roughness={0.35} /></mesh>
    </group>))}
    <Line points={[part.position, [part.position[0], 1.5, part.position[2]], label]} color={color(selected)} lineWidth={1.5} />
    <mesh position={part.position}><sphereGeometry args={[0.065, 12, 8]} /><meshBasicMaterial color={color(selected)} /></mesh>
    <Html position={label} center zIndexRange={[30, 0]}>
      <div style={{ width: 220, padding: 12, borderRadius: 12, background: "#121b24f5", border: `1px solid ${color(selected)}`, color: "#eef4f8", font: "12px system-ui", boxShadow: "0 8px 24px #0006" }}>
        <div style={{ fontSize: 10, color: "#a9b8c3", marginBottom: 5 }}>ILLUSTRATIVE COMPONENT LAYOUT</div>
        <strong>{part.name}</strong><div style={{ color: "#bdcbd5", marginTop: 3 }}>{part.description}</div>
        {active.length ? active.map((finding, index) => <div key={index} role="status" style={{ color: "#ffbf69", marginTop: 8 }}>
          {finding.severity === "warning" ? "⚠ " : "ⓘ "}{finding.label}<div style={{ fontSize: 10, marginTop: 3 }}>Source: {finding.source}</div>
        </div>) : <div style={{ color: "#a9b8c3", marginTop: 8 }}>No maintenance finding supplied for this component.</div>}
        <div role="group" aria-label="Inspect component" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginTop: 10 }}>
          {(Object.keys(parts) as CarComponent[]).map(id => <button key={id} type="button" aria-pressed={selected === id} onClick={() => setPicked(id)} style={{ border: "1px solid #40515e", borderRadius: 6, padding: "6px 4px", cursor: "pointer", color: color(id), background: selected === id ? "#293b49" : "#17232c" }}>{parts[id].name}{findings.some(f => f.component === id) ? " ⚠" : ""}</button>)}
        </div>
      </div>
    </Html>
  </group>;
}
