import { Group, Mesh, MeshPhysicalMaterial, Object3D } from "three";
import type { VehicleConfig } from "@/contracts";
import { assetSpec, loadAsset } from "./assets";
import { cloneOwnedObject, disposeObject } from "./dispose";
import { applyPaint } from "./paint";
import { ViewMaterials } from "./viewModes";
import type { CarStageProps } from "./types";

type Layer = { root: Object3D; materials: ViewMaterials; opacity: number; startOpacity: number };
export class VehicleController {
  readonly group = new Group();
  private layers: Layer[] = [];
  private generation = 0;
  private elapsed = 0;
  private duration = 0;
  private skipped = false;
  private fading = false;
  private complete: (() => void) | undefined;
  constructor(private readonly load = loadAsset) {}

  async select(vehicle: VehicleConfig, duration: number, status: CarStageProps["onModelStatus"], ready: () => void, complete: () => void) {
    const generation = ++this.generation;
    this.skipped = false;
    // Finish the visual blend already in flight; never complete a superseded request.
    this.complete = undefined;
    if (this.fading) this.finish();
    status({ vehicleId: vehicle.id, ready: false });
    const spec = assetSpec(vehicle);
    try {
      const source = await this.load(spec.url);
      if (generation !== this.generation) return;
      const root = cloneOwnedObject(source);
      // XV80 source faces -X. Align it to the frozen +X camera convention.
      if (spec.url.includes("camry-v80")) root.rotation.y += Math.PI;
      root.traverse((object) => {
        const mesh = object as Mesh;
        if (!mesh.isMesh) return;
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          const pbr = material as MeshPhysicalMaterial;
          if (/^GLASS(?:1)?\.001$/i.test(material.name) || material.name.endsWith("_Windows")) {
            pbr.color.set("#151b22"); pbr.roughness = 0.12; pbr.metalness = 0.05;
            pbr.transparent = false; pbr.opacity = 1; pbr.transmission = 0; pbr.clearcoat = 1;
          }
          // Lamp glass uses alpha instead of a second full-scene transmission target.
          if (pbr.transmission > 0) { pbr.transmission = 0; pbr.transparent = true; pbr.opacity = 0.35; pbr.depthWrite = false; }
          if (/tire/i.test(material.name)) { pbr.metalness = 0; pbr.roughness = 0.88; }
          if (/black|grille/i.test(material.name)) { pbr.metalness = 0.05; pbr.roughness = 0.48; }
        }
      });
      applyPaint(root, spec.body, spec.hex);
      this.layers.forEach((layer) => { layer.startOpacity = layer.opacity; });
      const layer = { root, materials: new ViewMaterials(root), opacity: this.layers.length ? 0 : 1, startOpacity: 0 };
      this.layers.push(layer);
      this.group.add(root);
      this.duration = this.skipped ? 0 : duration;
      this.elapsed = 0;
      this.fading = true;
      this.complete = complete;
      status({ vehicleId: vehicle.id, ready: true });
      ready();
      if (!this.duration) this.finish();
    } catch (error) {
      if (generation !== this.generation) return;
      status({ vehicleId: vehicle.id, ready: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  update(delta: number, mode: CarStageProps["viewMode"]) {
    if (this.fading) {
      this.elapsed += delta;
      const progress = Math.min(1, this.elapsed / Math.max(this.duration, 0.001));
      const t = progress * progress * (3 - 2 * progress);
      this.layers.forEach((layer, index) => {
        layer.opacity = index === this.layers.length - 1 ? Math.max(layer.opacity, t) : layer.startOpacity * (1 - t);
      });
      if (progress === 1) this.finish();
    }
    this.layers.forEach((layer) => layer.materials.update(mode, layer.opacity));
  }

  skip() { this.skipped = true; if (this.fading) this.finish(); }
  private finish() {
    this.fading = false;
    while (this.layers.length > 1) disposeObject(this.layers.shift()!.root);
    if (this.layers[0]) this.layers[0].opacity = 1;
    const callback = this.complete;
    this.complete = undefined;
    callback?.();
  }
  dispose() {
    ++this.generation;
    this.complete = undefined;
    this.layers.forEach((layer) => disposeObject(layer.root));
    this.layers = [];
    this.group.removeFromParent();
  }
}
