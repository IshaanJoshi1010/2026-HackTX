"use client";

import { useEffect, useMemo } from "react";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { Quaternion, Vector2, Vector3 } from "three";
import type { CarComponent } from "./maintenance";

type Point = [number, number, number];
const tireProfile = [[0.255,-0.105],[0.33,-0.115],[0.395,-0.085],[0.405,-0.055],[0.405,0.055],[0.395,0.085],[0.33,0.115],[0.255,0.105],[0.255,-0.105]].map(([r,y]) => new Vector2(r,y));

function Beam({ from, to, radius = 0.035, color = "#697179" }: { from: Point; to: Point; radius?: number; color?: string }) {
  const start = new Vector3(...from), end = new Vector3(...to), direction = end.clone().sub(start);
  const rotation = new Quaternion().setFromUnitVectors(new Vector3(0,1,0), direction.clone().normalize());
  // Numeric tuples also work when the preview bundles a separate Three runtime.
  return <mesh position={start.add(end).multiplyScalar(0.5).toArray()} quaternion={rotation.toArray()}>
    <cylinderGeometry args={[radius,radius,direction.length(),10]} />
    <meshStandardMaterial color={color} metalness={0.8} roughness={0.32} />
  </mesh>;
}

function Housing({ position, size, color = "#767d83", roughness = 0.34 }: { position: Point; size: Point; color?: string; roughness?: number }) {
  const [width, height, depth] = size;
  const geometry = useMemo(() => new RoundedBoxGeometry(width, height, depth, 2, Math.min(0.025, height / 3, width / 3, depth / 3)), [width, height, depth]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh position={position} geometry={geometry}>
    <meshStandardMaterial color={color} metalness={0.75} roughness={roughness} />
  </mesh>;
}

/** Generic mechanical visualization. Dimensions and assemblies are illustrative. */
export function StructureAssembly({ hybrid, accent, onSelect }: { hybrid: boolean; accent: (id: CarComponent) => string; onSelect: (id: CarComponent) => void }) {
  const roof = hybrid ? 1.62 : 1.43;
  const select = (id: CarComponent) => (event: { stopPropagation(): void }) => { event.stopPropagation(); onSelect(id); };
  return <group>
    {/* Open unibody: sills, crossmembers, pillars and roof rails surround the hardware. */}
    {[-0.69,0.69].map(z => <group key={z}>
      <Housing position={[0,0.3,z]} size={[3.95,0.13,0.12]} color="#434b52" />
      <Beam from={[-1.83,0.37,z]} to={[-0.8,roof,z*0.86]} radius={0.045} />
      <Beam from={[-0.8,roof,z*0.86]} to={[0.48,roof,z*0.86]} radius={0.045} />
      <Beam from={[0.48,roof,z*0.86]} to={[1.22,0.66,z]} radius={0.045} />
      <Beam from={[-0.25,0.34,z]} to={[-0.25,roof,z*0.86]} radius={0.035} />
      <Beam from={[-1.85,0.65,z]} to={[1.85,0.65,z]} radius={0.022} color="#454d55" />
    </group>)}
    {[-1.7,-0.8,0.4,1.7].map(x => <Housing key={x} position={[x,0.29,0]} size={[0.12,0.1,1.4]} color="#4f565e" />)}
    {[-0.8,0.48].map(x => <Beam key={x} from={[x,roof,-0.59]} to={[x,roof,0.59]} radius={0.035} />)}
    <Housing position={[-0.2,0.31,0]} size={[2.2,0.05,1.16]} color="#333a41" roughness={0.6} />
    {/* Cast block, valve cover, intake runners and transmission housing. */}
    <group onClick={select("engine")}>
      <Housing position={[1.3,0.62,0]} size={[0.65,0.46,0.66]} color="#686e72" roughness={0.48} />
      <Housing position={[1.3,0.9,0]} size={[0.72,0.14,0.62]} color="#343a40" />
      <Housing position={[1.3,0.98,0]} size={[0.52,0.025,0.13]} color={accent("engine")} />
      <Housing position={[0.82,0.53,0]} size={[0.35,0.29,0.45]} color="#777d80" />
      {[-0.24,-0.08,0.08,0.24].map(z => <Beam key={z} from={[1.08,0.82,z]} to={[0.87,0.69,z]} radius={0.055} color="#8b9094" />)}
      <Housing position={[1.84,0.65,0]} size={[0.065,0.46,0.74]} color="#30363c" />
      {[-0.28,-0.14,0,0.14,0.28].map(z => <Beam key={z} from={[1.88,0.45,z]} to={[1.88,0.85,z]} radius={0.008} />)}
    </group>
    <group onClick={select("battery")}>
      <Housing position={[-0.55,0.48,0]} size={hybrid ? [1.05,0.22,0.95] : [0.43,0.28,0.38]} color="#383f46" />
      <Housing position={[-0.55,hybrid ? 0.6 : 0.63,0]} size={hybrid ? [1,0.035,0.9] : [0.4,0.035,0.35]} color="#70777c" />
      <Housing position={[-0.55,hybrid ? 0.626 : 0.656,0]} size={[0.22,0.012,0.07]} color={accent("battery")} />
      {[-1,1].map(s => <mesh key={s} position={[-0.55+s*0.14,hybrid ? 0.64 : 0.67,0.11]}><cylinderGeometry args={[0.025,0.025,0.035,12]} /><meshStandardMaterial color={s===1 ? "#8b332b" : "#1a1e22"} metalness={0.4} roughness={0.4} /></mesh>)}
    </group>
    {/* Cylindrical tire shoulders, machined rotors, hubs, spokes and calipers. */}
    {[-1.3,1.35].flatMap(x => [-0.9,0.9].map(z => <group key={`${x}:${z}`} position={[x,0.42,z]}>
      <mesh rotation={[Math.PI/2,0,0]} onClick={select("tires")}><latheGeometry args={[tireProfile,48]} /><meshStandardMaterial color="#171a1d" roughness={0.92} metalness={0.03} /></mesh>
      <mesh rotation={[Math.PI/2,0,0]} onClick={select("brakes")}><cylinderGeometry args={[0.23,0.23,0.035,40]} /><meshStandardMaterial color="#8a8f93" metalness={0.9} roughness={0.27} /></mesh>
      <group onClick={select("tires")}>
        <mesh position={[0,0,Math.sign(z)*0.105]}><torusGeometry args={[0.257,0.017,8,40]} /><meshStandardMaterial color="#a0a5a9" metalness={0.9} roughness={0.22} /></mesh>
        {[0,1,2,3,4].map(i => { const a=i*Math.PI*2/5; return <Beam key={i} from={[Math.sin(a)*0.055,Math.cos(a)*0.055,Math.sign(z)*0.12]} to={[Math.sin(a)*0.245,Math.cos(a)*0.245,Math.sign(z)*0.105]} radius={0.018} color="#adb1b5" />; })}
      </group>
      <mesh rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[0.065,0.065,0.26,20]} /><meshStandardMaterial color="#5d646a" metalness={0.85} roughness={0.3} /></mesh>
      <group onClick={select("brakes")}><Housing position={[0.18,0.06,Math.sign(z)*0.04]} size={[0.1,0.19,0.085]} color={accent("brakes")} /></group>
      <Beam from={[0,0,-z*0.22]} to={[0,0,-z]} radius={0.035} />
      <Beam from={[0,0,-z*0.25]} to={[0,0.43,-z*0.3]} radius={0.045} color="#454c53" />
    </group>))}
  </group>;
}
