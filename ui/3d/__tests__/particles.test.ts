import { describe, expect, it, vi } from "vitest";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Points } from "three";
import type { VehicleConfig } from "@/contracts";
import { RevealClock, revealStages } from "../ParticleReveal";
import { VehicleController } from "../VehicleController";

const car = { id: "camry-2022-se", modelAsset: "/fixture.glb", paint: "#111111" } as VehicleConfig;
const source = () => { const root = new Group(); root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial({ name: "Body" }))); return root; };
const data = new Float32Array(32768 * 3);
describe("particle reveal", () => {
  it("reports boundaries at the frozen times and skips remaining stages once", () => {
    const events: [string, number][] = []; let time = 0;
    const clock = new RevealClock(stage => events.push([stage, time]));
    clock.advance(0);
    for (const dt of [1.999, 0.001, 0.5, 0.5, 1]) { time += dt; clock.advance(dt); }
    expect(events).toEqual([["converge", 0], ["pointcloud", 2], ["wireframe", 2.5], ["solid", 3], ["done", 4]]);
    clock.skip(); expect(events).toHaveLength(5);
  });
  it("preloads both resources and remembers skip during load", async () => {
    let resolve!: (points: Float32Array) => void;
    const controller = new VehicleController(async () => source(), () => new Promise(done => { resolve = done; }));
    const stage = vi.fn(), status = vi.fn();
    const pending = controller.select(car, 0, status, vi.fn(), vi.fn(), { quality: "high", reveal: true, onStage: stage });
    controller.skip(); expect(stage).not.toHaveBeenCalled(); resolve(data); await pending;
    expect(stage.mock.calls.flat()).toEqual(revealStages);
    expect(controller.group.children).toHaveLength(1); controller.dispose();
  });
  it("reduced motion allocates no particles and fires stages immediately", async () => {
    const controller = new VehicleController(async () => source(), async () => data), stage = vi.fn();
    await controller.select(car, 0, vi.fn(), vi.fn(), vi.fn(), { quality: "high", reveal: true, reducedMotion: true, onStage: stage });
    expect(stage.mock.calls.flat()).toEqual(revealStages); expect(controller.group.children).toHaveLength(1); controller.dispose();
  });
  it("ten replays dispose particle and wire resources, without per-frame attribute changes", async () => {
    const controller = new VehicleController(async () => source(), async () => data);
    for (let i = 0; i < 10; i++) {
      const stage = vi.fn();
      await controller.select(car, 0, vi.fn(), vi.fn(), vi.fn(), { quality: "high", reveal: true, onStage: stage });
      const cloud = controller.group.children.find(object => object instanceof Points) as Points;
      const geometry = vi.spyOn(cloud.geometry, "dispose"), material = vi.spyOn(cloud.material as MeshStandardMaterial, "dispose");
      const attribute = cloud.geometry.getAttribute("position"), snapshot = attribute.array.slice();
      controller.update(1, "solid"); expect(attribute.array).toEqual(snapshot);
      controller.skip(); controller.update(5, "solid");
      expect(stage.mock.calls.flat()).toEqual(revealStages);
      expect(geometry).toHaveBeenCalledTimes(1); expect(material).toHaveBeenCalledTimes(1);
      expect(controller.group.children).toHaveLength(1);
    }
    controller.dispose(); expect(controller.group.children).toHaveLength(0);
  });
});
