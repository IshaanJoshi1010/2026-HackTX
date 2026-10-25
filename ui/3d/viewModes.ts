import { BufferGeometry, Float32BufferAttribute, Material, Mesh, Object3D, Points, PointsMaterial } from "three";
import type { CarStageProps } from "./types";

const coverageUniforms = new WeakMap<Material, { value: number }>();
function screenCoverage(material: Material) {
  const existing = coverageUniforms.get(material);
  if (existing) return existing;
  const coverage = { value: 1 }, compile = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.uniforms.uRevealCoverage = coverage;
    shader.fragmentShader = "uniform float uRevealCoverage;\n" + shader.fragmentShader.replace(
      "#include <clipping_planes_fragment>",
      `#include <clipping_planes_fragment>
      // All surfaces use the SAME screen-space threshold. Where the exterior
      // disappears, the cabin disappears too rather than showing through it.
      if (uRevealCoverage < 1.0) {
        float threshold = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(0.06711056, 0.00583715))));
        if (uRevealCoverage <= threshold) discard;
      }`);
  };
  material.customProgramCacheKey = () => key + ":fork-screen-coverage-v1";
  material.needsUpdate = true;
  coverageUniforms.set(material, coverage);
  return coverage;
}

export class ViewMaterials {
  private readonly originals = new Map<Material, { opacity: number; transparent: boolean; depthWrite: boolean; alphaHash: boolean }>();
  constructor(root: Object3D) {
    root.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        screenCoverage(material);
        this.originals.set(material, { opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite, alphaHash: material.alphaHash });
      }
    });
  }
  update(mode: CarStageProps["viewMode"], opacity: number, reveal = false) {
    for (const [material, original] of this.originals) {
      coverageUniforms.get(material)!.value = reveal ? opacity : 1;
      const materialOpacity = reveal ? 1 : opacity;
      const wire = material as Material & { wireframe?: boolean };
      const wireframe = mode === "wireframe";
      // Opaque bodywork dissolves as surface coverage instead of exposing every
      // internal mesh through a transparent shell. Glass retains its own blending.
      const dissolve = !wireframe && !original.transparent && materialOpacity < 1;
      const alphaHash = original.alphaHash || dissolve;
      const transparent = original.transparent || (wireframe && materialOpacity < 1);
      if (wire.wireframe !== wireframe || material.transparent !== transparent || material.alphaHash !== alphaHash) material.needsUpdate = true;
      wire.wireframe = wireframe;
      material.opacity = original.opacity * materialOpacity;
      material.transparent = transparent;
      material.alphaHash = alphaHash;
      material.depthWrite = dissolve ? original.depthWrite : materialOpacity < 1 ? false : original.depthWrite;
    }
  }
}

export function createPointsView(data: Float32Array) {
  const geometry = new BufferGeometry().setAttribute("position", new Float32BufferAttribute(data.slice(), 3));
  const cloud = new Points(geometry, new PointsMaterial({ color: "#27E1FF", size: 2, sizeAttenuation: false, transparent: true, depthWrite: false }));
  cloud.userData.contactIgnore = true;
  return cloud;
}
