import { describe, expect, it, vi } from "vitest";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture, type Material, type WebGLRenderer } from "three";
import type { VehicleConfig } from "@/contracts";
import { cloneOwnedObject, disposeObject } from "../dispose";
import { applyPaint } from "../paint";
import { VehicleController } from "../VehicleController";
import { ViewMaterials } from "../viewModes";

const vehicle: VehicleConfig = { id: "fixture", model: "Camry", make: "Toyota", year: 2022, trim: "SE", powertrain: "gas", paint: "#cc2222", mpg: 32, seats: 5, cargoCuFt: 15, msrp: 26000, modelAsset: "/fixture.glb", matchStatus: "representative", specSources: [] };
function source() {
  const root = new Group();
  const material = new MeshStandardMaterial({ name: "Body", color: "#ffffff", map: new Texture() });
  const mesh = new Mesh(new BoxGeometry(), material);
  root.add(mesh, new Mesh(mesh.geometry, material));
  return root;
}

describe("viewer resource ownership", () => {
  it("uses equal screen coverage for body and cabin while keeping opaque depth writes", () => {
    const root = source();
    const cabin = new MeshStandardMaterial(); root.add(new Mesh(new BoxGeometry(), cabin));
    const body = (root.children[0] as Mesh<BoxGeometry, MeshStandardMaterial>).material;
    const modes = new ViewMaterials(root);
    const shaders = [body, cabin].map(material => {
      const shader = { uniforms: {}, vertexShader: "", fragmentShader: "#include <clipping_planes_fragment>" } as Parameters<Material["onBeforeCompile"]>[0];
      material.onBeforeCompile(shader, {} as WebGLRenderer);
      return shader;
    });
    modes.update("solid", 0.5, true);
    for (const shader of shaders) expect(shader.uniforms.uRevealCoverage.value).toBe(0.5);
    for (const material of [body, cabin]) {
      expect(material.opacity).toBe(1); expect(material.transparent).toBe(false);
      expect(material.depthWrite).toBe(true); expect(material.alphaHash).toBe(false);
    }
    modes.update("solid", 1);
    for (const shader of shaders) expect(shader.uniforms.uRevealCoverage.value).toBe(1);
    disposeObject(root);
  });
  it("dissolves opaque paint with depth coverage and preserves transparent glass", () => {
    const root = source();
    const glass = new MeshStandardMaterial({ transparent: true, opacity: 0.35, depthWrite: false });
    root.add(new Mesh(new BoxGeometry(), glass));
    const body = (root.children[0] as Mesh<BoxGeometry, MeshStandardMaterial>).material;
    const modes = new ViewMaterials(root);
    modes.update("solid", 0.5);
    expect(body.alphaHash).toBe(true);
    expect(body.transparent).toBe(false);
    expect(body.depthWrite).toBe(true);
    expect(glass.alphaHash).toBe(false);
    expect(glass.transparent).toBe(true);
    expect(glass.opacity).toBeCloseTo(0.175);
    modes.update("solid", 1);
    expect(body.alphaHash).toBe(false);
    expect(body.opacity).toBe(1);
    expect(glass.opacity).toBe(0.35);
    disposeObject(root);
  });
  it("clones shared resources once per instance, preserves cache, and disposes owned resources once", () => {
    const original = source();
    const owned = cloneOwnedObject(original);
    const originalMesh = original.children[0] as Mesh<BoxGeometry, MeshStandardMaterial>;
    const mesh = owned.children[0] as Mesh<BoxGeometry, MeshStandardMaterial>;
    expect(mesh.geometry).not.toBe(originalMesh.geometry);
    expect(mesh.material.map).not.toBe(originalMesh.material.map);
    expect((owned.children[1] as Mesh).geometry).toBe(mesh.geometry);
    const geometryDispose = vi.spyOn(mesh.geometry, "dispose");
    const textureDispose = vi.spyOn(mesh.material.map!, "dispose");
    const originalDispose = vi.spyOn(originalMesh.geometry, "dispose");
    applyPaint(owned, "Body", "#cc2222");
    expect((owned.children[0] as Mesh<BoxGeometry, MeshStandardMaterial>).material.color.getHexString()).toBe("cc2222");
    expect(originalMesh.material.color.getHexString()).toBe("ffffff");
    disposeObject(owned);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(textureDispose).toHaveBeenCalledTimes(1);
    expect(originalDispose).not.toHaveBeenCalled();
  });

  it("preserves original color for invalid paint and restores alpha after wireframe fade", () => {
    const root = source();
    applyPaint(root, "missing", "silver");
    const mesh = root.children[0] as Mesh<BoxGeometry, MeshStandardMaterial>;
    expect(mesh.material.color.getHexString()).toBe("ffffff");
    const modes = new ViewMaterials(root);
    modes.update("wireframe", 0.5);
    expect(mesh.material.wireframe).toBe(true);
    expect(mesh.material.opacity).toBe(0.5);
    modes.update("solid", 1);
    expect(mesh.material.wireframe).toBe(false);
    expect(mesh.material.transparent).toBe(false);
    expect(mesh.material.depthWrite).toBe(true);
  });
});

describe("vehicle switching", () => {
  it("hides dense exterior topology in Structure and restores Studio without reloading", async () => {
    const loader = vi.fn(async () => source());
    const controller = new VehicleController(loader);
    await controller.select(vehicle, 0, vi.fn(), vi.fn(), vi.fn());
    const root = controller.group.children[0];
    controller.update(1 / 60, "wireframe");
    expect(root.visible).toBe(false);
    controller.update(1 / 60, "solid");
    expect(root.visible).toBe(true);
    expect(controller.group.children[0]).toBe(root);
    expect(loader).toHaveBeenCalledTimes(1);
    expect((root.children[0] as Mesh<BoxGeometry, MeshStandardMaterial>).material.wireframe).toBe(false);
    controller.dispose();
  });
  it("waits for shader preparation and disposes a prepared clone after unmount", async () => {
    let release!: () => void;
    let prepared: Group | undefined;
    const prepare = vi.fn(async (root) => {
      prepared = root;
      if (prepare.mock.calls.length === 1) await new Promise<void>(done => { release = done; });
    });
    const controller = new VehicleController(async () => source(), undefined, prepare);
    const ready = vi.fn();
    const pending = controller.select(vehicle, 0, vi.fn(), ready, vi.fn());
    await vi.waitFor(() => expect(prepared).toBeDefined());
    expect(ready).not.toHaveBeenCalled();
    const free = vi.spyOn((prepared!.children[0] as Mesh).geometry, "dispose");
    controller.dispose(); release(); await pending;
    expect(free).toHaveBeenCalledTimes(1);
    expect(ready).not.toHaveBeenCalled();
    expect(controller.group.children).toHaveLength(0);
  });
  it("keeps the old car while loading and on failure; crossfade disposes the outgoing car", async () => {
    let resolve!: (root: Group) => void;
    const loader = vi.fn().mockResolvedValueOnce(source()).mockImplementationOnce(() => new Promise<Group>((done) => { resolve = done; })).mockRejectedValueOnce(new Error("broken model"));
    const controller = new VehicleController(loader);
    const status = vi.fn(); const complete = vi.fn();
    await controller.select(vehicle, 0, status, vi.fn(), complete);
    const outgoing = controller.group.children[0];
    const dispose = vi.spyOn((outgoing.children[0] as Mesh).geometry, "dispose");
    const pending = controller.select({ ...vehicle, id: "rav4" }, 1.8, status, vi.fn(), complete);
    expect(controller.group.children).toHaveLength(1);
    resolve(source()); await pending;
    expect(controller.group.children).toHaveLength(2);
    controller.update(0.9, "solid");
    expect(controller.group.children).toHaveLength(2);
    controller.update(0.9, "solid");
    expect(controller.group.children).toHaveLength(1);
    expect(dispose).toHaveBeenCalledTimes(1);
    await controller.select(vehicle, 0, status, vi.fn(), complete);
    expect(controller.group.children).toHaveLength(1);
    expect(status).toHaveBeenLastCalledWith({ vehicleId: "fixture", ready: false, error: "broken model" });
    controller.dispose();
  });

  it("ignores stale loads and loads completing after unmount", async () => {
    let resolve!: (root: Group) => void;
    const loader = vi.fn().mockImplementationOnce(() => new Promise<Group>((done) => { resolve = done; })).mockResolvedValueOnce(source());
    const controller = new VehicleController(loader); const status = vi.fn();
    const pending = controller.select(vehicle, 0, status, vi.fn(), vi.fn());
    await controller.select({ ...vehicle, id: "new" }, 0, status, vi.fn(), vi.fn());
    controller.dispose(); resolve(source()); await pending;
    expect(controller.group.children).toHaveLength(0);
    expect(status).toHaveBeenLastCalledWith({ vehicleId: "new", ready: true });
  });

  it("skip during loading completes once without a blank intermediate scene", async () => {
    let resolve!: (root: Group) => void;
    const controller = new VehicleController(() => new Promise<Group>((done) => { resolve = done; }));
    const complete = vi.fn();
    const pending = controller.select(vehicle, 1.8, vi.fn(), vi.fn(), complete);
    controller.skip(); resolve(source()); await pending;
    expect(controller.group.children).toHaveLength(1);
    expect(complete).toHaveBeenCalledTimes(1);
    controller.skip(); controller.update(5, "solid");
    expect(complete).toHaveBeenCalledTimes(1);
    controller.dispose();
  });
});
