import { expect, it, vi } from "vitest";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Points, ShaderMaterial } from "three";
import type { VehicleConfig } from "@/contracts";
import { createParticleMorph, mortonSort } from "../ParticleMorph";
import { disposeObject } from "../dispose";
import { VehicleController } from "../VehicleController";

const a = { id: "camry-2022-se", modelAsset: "/fixture.glb", paint: "#111111" } as VehicleConfig;
const b = { ...a, id: "rav4-2024-hybrid-xle", paint: "#aaaaaa" };
const points = new Float32Array(32768 * 3);
const source = () => { const group = new Group(); group.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial({ name: "Body" }))); return group; };
const controller = () => new VehicleController(async () => source(), async () => points);

it("Morton pairing preserves all input points without mutating cached arrays", () => {
  const input = new Float32Array([2,1,0, -2,0,-1, 0,0.5,0]);
  const original = input.slice(), sorted = mortonSort(input);
  expect(input).toEqual(original); expect([...sorted]).toEqual([-2,0,-1, 0,0.5,0, 2,1,0]);
  expect(() => createParticleMorph(input, new Float32Array(6), false)).toThrow("counts");
});
it("morph lasts 1.8s, has immutable attributes, and completes once with destination visible", async () => {
  const c = controller(), done = vi.fn();
  await c.select(a, 0, vi.fn(), vi.fn(), vi.fn());
  await c.select(b, 1.8, vi.fn(), vi.fn(), done, { quality: "high", transition: true });
  expect(c.isMorphing).toBe(true);
  expect(c.group.children[0].visible).toBe(true);
  expect(c.group.children[1].visible).toBe(false);
  const cloud = c.group.children.find(child => child instanceof Points) as Points;
  const original = cloud.geometry.getAttribute("aFrom").array.slice();
  c.update(0.9, "solid"); expect(done).not.toHaveBeenCalled();
  expect((cloud.material as ShaderMaterial).uniforms.uMorph.value).toBeCloseTo(0.5);
  expect(cloud.geometry.getAttribute("aFrom").array).toEqual(original);
  c.update(0.89, "solid"); expect(done).not.toHaveBeenCalled();
  c.update(0.02, "solid"); c.update(2, "solid");
  expect(done).toHaveBeenCalledTimes(1); expect(c.isMorphing).toBe(false);
  expect(c.group.children).toHaveLength(1); expect(c.group.children[0].visible).toBe(true); c.dispose();
});
it.each([{ fallback: true, reducedMotion: false, duration: 1 }, { fallback: false, reducedMotion: true, duration: 0.3 }])("fallback/reduced-motion completes once: %j", async options => {
  const c = controller(), done = vi.fn(); await c.select(a, 0, vi.fn(), vi.fn(), vi.fn());
  await c.select(b, 1.8, vi.fn(), vi.fn(), done, { quality: "high", transition: true, ...options });
  expect(c.isMorphing).toBe(false); c.update(options.duration - 0.01, "solid"); expect(done).not.toHaveBeenCalled();
  c.update(0.02, "solid"); c.skip(); expect(done).toHaveBeenCalledTimes(1); expect(c.group.children).toHaveLength(1); c.dispose();
});
it("ten alternating morphs and mid-morph skips dispose each temporary allocation", async () => {
  const c = controller(); await c.select(a, 0, vi.fn(), vi.fn(), vi.fn());
  for (let i = 0; i < 10; i++) {
    const done = vi.fn(); await c.select(i % 2 ? a : b, 1.8, vi.fn(), vi.fn(), done, { quality: "high", transition: true });
    const cloud = c.group.children.find(child => child instanceof Points) as Points;
    const free = vi.spyOn(cloud.geometry, "dispose");
    c.update(0.8, "solid"); if (i % 2) c.skip(); else c.update(1.1, "solid");
    c.update(1, "solid"); expect(done).toHaveBeenCalledTimes(1); expect(free).toHaveBeenCalledTimes(1);
    expect(c.group.children).toHaveLength(1); expect(c.isMorphing).toBe(false);
  }
  c.dispose(); expect(c.group.children).toHaveLength(0);
});
it("a missing destination point file uses crossfade and preserves readiness", async () => {
  const c = new VehicleController(async () => source(), vi.fn().mockResolvedValueOnce(points).mockRejectedValueOnce(new Error("offline")));
  await c.select(a, 0, vi.fn(), vi.fn(), vi.fn()); const done = vi.fn(), status = vi.fn();
  await c.select(b, 1.8, status, vi.fn(), done, { quality: "high", transition: true });
  expect(c.isMorphing).toBe(false); c.update(1, "solid"); expect(done).toHaveBeenCalledTimes(1);
  expect(status).toHaveBeenLastCalledWith(expect.objectContaining({ ready: true, error: expect.stringContaining("Particles unavailable") })); c.dispose();
});
it("low-quality morph has 8192 vertices and owns its resources", () => {
  const low = new Float32Array(8192 * 3), cloud = createParticleMorph(low, low, true);
  expect(cloud.geometry.getAttribute("position").count).toBe(8192);
  const free = vi.spyOn(cloud.material, "dispose"); disposeObject(cloud); expect(free).toHaveBeenCalledOnce();
});
