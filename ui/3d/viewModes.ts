import { BufferGeometry, Float32BufferAttribute, Material, Mesh, Object3D, Points, PointsMaterial } from "three";
import type { CarStageProps } from "./types";

export class ViewMaterials {
  private readonly originals = new Map<Material, { opacity: number; transparent: boolean; depthWrite: boolean }>();
  constructor(root: Object3D) {
    root.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        this.originals.set(material, { opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite });
      }
    });
  }
  update(mode: CarStageProps["viewMode"], opacity: number) {
    for (const [material, original] of this.originals) {
      const wire = material as Material & { wireframe?: boolean };
      const wireframe = mode === "wireframe";
      const transparent = original.transparent || opacity < 1;
      if (wire.wireframe !== wireframe || material.transparent !== transparent) material.needsUpdate = true;
      wire.wireframe = wireframe;
      material.opacity = original.opacity * opacity;
      material.transparent = transparent;
      material.depthWrite = opacity < 1 ? false : original.depthWrite;
    }
  }
}

export function createPointsView(data: Float32Array) {
  const geometry = new BufferGeometry().setAttribute("position", new Float32BufferAttribute(data.slice(), 3));
  const cloud = new Points(geometry, new PointsMaterial({ color: "#27E1FF", size: 2, sizeAttenuation: false, transparent: true, depthWrite: false }));
  cloud.userData.contactIgnore = true;
  return cloud;
}
