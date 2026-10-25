"use client";

import { Html, Line } from "@react-three/drei";
import { useState } from "react";
import { StructureAssembly } from "./StructureAssembly";
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
  const label: [number, number, number] = [part.position[0] * 0.45, 1.9, part.position[2]];
  return <group userData={{ contactIgnore: true }}>
    <StructureAssembly hybrid={vehicle.powertrain === "hybrid"} accent={id => findings.some(f => f.component === id) ? "#b98543" : selected === id ? "#8cabb5" : "#555e66"} onSelect={setPicked} />
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
