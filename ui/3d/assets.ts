import type { VehicleConfig } from "@/contracts";
import manifest from "@/public/models/manifest.json";
import type { Object3D } from "three";
import { disposeObject } from "./dispose";

export function assetSpec(vehicle: VehicleConfig) {
  const entry = manifest.find((item) => item.vehicleId === vehicle.id);
  return { url: vehicle.modelAsset || entry?.glb || "", body: entry?.bodyMaterialName || "",
    hex: /^#[0-9a-f]{6}$/i.test(vehicle.paint) ? vehicle.paint : entry?.paintHex || undefined };
}

// Bounded CPU-only cache. Renderers always receive owned resource clones.
const cache = new Map<string, Promise<Object3D>>();
export function loadAsset(url: string): Promise<Object3D> {
  if (!url) return Promise.reject(new Error("No model asset is configured."));
  const existing = cache.get(url);
  if (existing) return existing;
  const task = (async () => {
    const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([
      import("three/addons/loaders/GLTFLoader.js"), import("three/addons/loaders/DRACOLoader.js"),
    ]);
    const decoder = new DRACOLoader().setDecoderPath("/models/draco/").setWorkerLimit(2);
    try { return (await new GLTFLoader().setDRACOLoader(decoder).loadAsync(url)).scene; }
    finally { decoder.dispose(); }
  })();
  cache.set(url, task);
  task.catch(() => { if (cache.get(url) === task) cache.delete(url); });
  while (cache.size > 4) {
    const key = cache.keys().next().value!;
    const old = cache.get(key)!;
    cache.delete(key);
    void old.then(disposeObject, () => {});
  }
  return task;
}

export async function preloadCars(vehicles: VehicleConfig[]): Promise<void> {
  await Promise.all([...new Set(vehicles.map((vehicle) => assetSpec(vehicle).url))].map(loadAsset));
}
