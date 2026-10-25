import { BufferGeometry, Float32BufferAttribute, Material, Mesh, Object3D, Points, PointsMaterial } from "three";
import type { CarStageProps } from "./types";

export class ViewMaterials {
  private readonly originals = new Map<Material, { opacity: number; transparent: boolean; depthWrite: boolean; alphaHash: boolean }>();
  constructor(root: Object3D) {
    root.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        this.originals.set(material, { opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite, alphaHash: material.alphaHash });
      }
    });
  }
  update(mode: CarStageProps["viewMode"], opacity: number) {
    for (const [material, original] of this.originals) {
      const wire = material as Material & { wireframe?: boolean };
      const wireframe = mode === "wireframe";
      // Opaque bodywork dissolves as surface coverage instead of exposing every
      // internal mesh through a transparent shell. Glass retains its own blending.
      const dissolve = !wireframe && !original.transparent && opacity < 1;
      const alphaHash = original.alphaHash || dissolve;
      const transparent = original.transparent || (wireframe && opacity < 1);
      if (wire.wireframe !== wireframe || material.transparent !== transparent || material.alphaHash !== alphaHash) material.needsUpdate = true;
      wire.wireframe = wireframe;
      material.opacity = original.opacity * opacity;
      material.transparent = transparent;
      material.alphaHash = alphaHash;
      material.depthWrite = dissolve ? original.depthWrite : opacity < 1 ? false : original.depthWrite;
    }
  }
}

export function createPointsView(data: Float32Array) {
  const geometry = new BufferGeometry().setAttribute("position", new Float32BufferAttribute(data.slice(), 3));
  const cloud = new Points(geometry, new PointsMaterial({ color: "#27E1FF", size: 2, sizeAttenuation: false, transparent: true, depthWrite: false }));
  cloud.userData.contactIgnore = true;
  return cloud;
}
