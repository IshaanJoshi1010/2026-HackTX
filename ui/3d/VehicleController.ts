import { Color, DoubleSide, Group, Mesh, MeshPhysicalMaterial, Object3D } from "three";
import type { VehicleConfig } from "@/contracts";
import { assetSpec, loadAsset } from "./assets";
import { cloneOwnedObject, disposeObject } from "./dispose";
import { applyPaint } from "./paint";
import { createPointsView, ViewMaterials } from "./viewModes";
import { loadPointsFile, pointsUrl, type Quality } from "./usePointsFile";
import { createParticleReveal, RevealClock } from "./ParticleReveal";
import { createParticleMorph, createScanLine, forceFallback } from "./ParticleMorph";
import type { CarStageProps } from "./types";
import { smootherStep } from "./animationMath";

type Layer = { root: Object3D; materials: ViewMaterials; opacity: number; startOpacity: number; data?: Float32Array; cloud?: ReturnType<typeof createPointsView>; hex?: string };
export type AnimationOptions = { quality: Quality; reveal?: boolean; transition?: boolean; reducedMotion?: boolean; fallback?: boolean; onStage?: CarStageProps["onRevealStage"] };
export class VehicleController {
  readonly group = new Group();
  private layers: Layer[] = [];
  private generation = 0;
  private elapsed = 0;
  private duration = 0;
  private skipped = false;
  private fading = false;
  private complete: (() => void) | undefined;
  private reveal?: { clock: RevealClock; cloud: ReturnType<typeof createParticleReveal>; wire: Object3D; materials: ViewMaterials };
  private morph?: ReturnType<typeof createParticleMorph>;
  private scan?: Mesh;
  private paints: MeshPhysicalMaterial[] = [];
  private fromColor = new Color();
  private toColor = new Color();
  private readonly cyan = new Color("#A8D9FF");
  get isMorphing() { return !!this.morph; }
  constructor(private readonly load = loadAsset, private readonly loadPoints = loadPointsFile,
    private readonly prepare?: (root: Object3D) => Promise<void>) {}

  async select(vehicle: VehicleConfig, duration: number, status: CarStageProps["onModelStatus"], ready: () => void, complete: () => void, options?: AnimationOptions) {
    const generation = ++this.generation;
    this.skipped = false;
    // Finish the visual blend already in flight; never complete a superseded request.
    this.complete = undefined;
    this.clearReveal();
    if (this.fading) this.finish();
    status({ vehicleId: vehicle.id, ready: false });
    const spec = assetSpec(vehicle);
    try {
      const url = pointsUrl(vehicle.id, options?.quality ?? "high");
      let pointError: string | undefined;
      const [source, data] = await Promise.all([this.load(spec.url), url ? this.loadPoints(url, options?.quality ?? "high").catch(() => { pointError = "Particles unavailable; solid preview is active."; return undefined; }) : undefined]);
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
      if (this.prepare) {
        // Compile the fade variant before changing the visible scene. Restore opaque state.
        const warmup = new ViewMaterials(root);
        try { warmup.update("solid", 0.5); await this.prepare(root); warmup.update("solid", 1); await this.prepare(root); }
        catch (error) { disposeObject(root); throw error; }
        if (generation !== this.generation) { disposeObject(root); return; }
      }
      this.layers.forEach((layer) => { layer.startOpacity = layer.opacity; });
      const outgoing = this.layers.at(-1);
      const layer: Layer = { root, data, hex: spec.hex, materials: new ViewMaterials(root), opacity: this.layers.length ? 0 : 1, startOpacity: 0 };
      this.layers.push(layer);
      this.group.add(root);
      this.duration = this.skipped ? 0 : duration;
      this.elapsed = 0;
      this.fading = true;
      this.complete = complete;
      if (options?.transition && outgoing && !this.skipped) {
        // Missing samples and the explicit demo switch both preserve the solid fallback.
        if (!options.reducedMotion && !options.fallback && !forceFallback && outgoing.data && data && outgoing.data.length === data.length) {
          this.morph = createParticleMorph(outgoing.data, data, options.quality === "low");
          this.group.add(this.morph); this.duration = 1.8;
          this.fromColor.set(outgoing.hex || "#888888"); this.toColor.set(spec.hex || "#888888");
          root.traverse(object => {
            if (!(object instanceof Mesh)) return;
            for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
              if (material instanceof MeshPhysicalMaterial && (material.name === spec.body || /body|paint|carpaint|exterior/i.test(material.name))) this.paints.push(material);
            }
          });
        } else if (!options.reducedMotion) {
          this.duration = 1;
          const scan = createScanLine(); scan.material.side = DoubleSide;
          this.scan = new Mesh(scan.geometry, scan.material); this.scan.userData.contactIgnore = true; this.scan.renderOrder = 20;
          this.group.add(this.scan);
        } else this.duration = 0.3;
      }
      status({ vehicleId: vehicle.id, ready: true, ...(pointError ? { error: pointError } : {}) });
      ready();
      if (options?.reveal) {
        this.finish();
        const clock = new RevealClock(options.onStage ?? (() => {}));
        if (options.reducedMotion || this.skipped || !data) clock.skip();
        else {
          const cloud = createParticleReveal(data, options.quality === "low");
          const wire = cloneOwnedObject(root), materials = new ViewMaterials(wire);
          this.group.add(cloud, wire); wire.visible = false; root.visible = false;
          this.reveal = { clock, cloud, wire, materials }; clock.advance(0);
        }
      }
      if (!this.duration) this.finish();
    } catch (error) {
      if (generation !== this.generation) return;
      status({ vehicleId: vehicle.id, ready: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  update(delta: number, mode: CarStageProps["viewMode"], pixelRatio = 1) {
    if (this.reveal) {
      const { clock, cloud, wire, materials } = this.reveal;
      clock.advance(delta);
      const time = clock.elapsed, layer = this.layers.at(-1)!;
      cloud.material.uniforms.uProgress.value = Math.min(1, time / 2);
      cloud.material.uniforms.uTime.value = time;
      cloud.material.uniforms.uPixelRatio.value = pixelRatio;
      cloud.material.uniforms.uOpacity.value = 0.8 * smootherStep(time / 0.45) * (1 - smootherStep((time - 2.65) / 1.05));
      wire.visible = time >= 2.5 && time < 4;
      materials.update("wireframe", 0.35 * smootherStep((time - 2.5) / 0.5) * (1 - smootherStep((time - 3) / 0.65)));
      layer.root.visible = time >= 3;
      layer.materials.update("solid", smootherStep(time - 3));
      if (time < 4) return;
      this.clearReveal();
    }
    if (this.fading) {
      this.elapsed += delta;
      const progress = Math.min(1, this.elapsed / Math.max(this.duration, 0.001));
      const t = smootherStep(progress);
      if (this.morph) {
        const morph = Math.max(0, Math.min(1, (this.elapsed - 0.3) / 1.2));
        const eased = smootherStep(morph);
        this.morph.material.uniforms.uMorph.value = morph;
        this.morph.material.uniforms.uOpacity.value = 0.85 * Math.min(smootherStep(this.elapsed / 0.3), smootherStep((1.8 - this.elapsed) / 0.3));
        this.morph.material.uniforms.uPixelRatio.value = pixelRatio;
        this.morph.material.uniforms.uColor.value.copy(this.fromColor).lerp(this.toColor, eased).lerp(this.cyan, 0.7);
        this.paints.forEach(material => material.color.lerpColors(this.fromColor, this.toColor, eased));
        this.layers.forEach((layer, index) => { layer.opacity = index === this.layers.length - 1 ? smootherStep((this.elapsed - 1.5) / 0.3) : 1 - smootherStep(this.elapsed / 0.3); });
      } else {
        this.layers.forEach((layer, index) => { layer.opacity = index === this.layers.length - 1 ? Math.max(layer.opacity, t) : layer.startOpacity * (1 - t); });
        if (this.scan) (this.scan.material as ReturnType<typeof createScanLine>["material"]).uniforms.uProgress.value = progress;
      }
      if (progress === 1) this.finish();
    }
    this.layers.forEach((layer) => {
      if (!this.fading && mode === "points" && layer.data) {
        if (!layer.cloud) { layer.cloud = createPointsView(layer.data); this.group.add(layer.cloud); }
        layer.cloud.material.opacity = layer.opacity; layer.root.visible = false;
      } else {
        if (layer.cloud) { disposeObject(layer.cloud); layer.cloud = undefined; }
        layer.root.visible = layer.opacity > 0;
      }
      layer.materials.update(this.fading ? "solid" : mode, layer.opacity);
    });
  }

  skip() { this.skipped = true; if (this.reveal) { this.reveal.clock.skip(); this.clearReveal(); } if (this.fading) this.finish(); }
  private clearReveal() {
    if (!this.reveal) return;
    disposeObject(this.reveal.cloud); disposeObject(this.reveal.wire); this.reveal = undefined;
    this.layers.forEach(layer => { layer.root.visible = true; layer.materials.update("solid", 1); });
  }
  private disposeLayer(layer: Layer) { disposeObject(layer.root); if (layer.cloud) disposeObject(layer.cloud); }
  private finish() {
    this.fading = false;
    this.clearMorph();
    while (this.layers.length > 1) this.disposeLayer(this.layers.shift()!);
    if (this.layers[0]) this.layers[0].opacity = 1;
    const callback = this.complete;
    this.complete = undefined;
    callback?.();
  }
  private clearMorph() {
    if (this.morph) { disposeObject(this.morph); this.morph = undefined; }
    if (this.scan) { disposeObject(this.scan); this.scan = undefined; }
    this.paints.forEach(material => material.color.copy(this.toColor)); this.paints = [];
  }
  dispose() {
    ++this.generation;
    this.complete = undefined;
    this.clearReveal();
    this.clearMorph();
    this.layers.forEach((layer) => this.disposeLayer(layer));
    this.layers = [];
    this.group.removeFromParent();
  }
}
