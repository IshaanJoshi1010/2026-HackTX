import { BufferGeometry, Material, Mesh, Object3D, Texture } from "three";

/** Frees an owned tree. Never pass a shared loader-cache scene here. */
export function disposeObject(root: Object3D): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
  // Texture images may be shared with the CPU cache. Do not close ImageBitmaps.
  root.removeFromParent();
}

/** Deep GPU-resource clone: cached source geometry/materials are never rendered or edited. */
export function cloneOwnedObject(source: Object3D): Object3D {
  const clone = source.clone(true);
  const geometries = new Map<BufferGeometry, BufferGeometry>();
  const materials = new Map<Material, Material>();
  const textures = new Map<Texture, Texture>();
  clone.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    if (!geometries.has(mesh.geometry)) geometries.set(mesh.geometry, mesh.geometry.clone());
    mesh.geometry = geometries.get(mesh.geometry)!;
    const copy = (original: Material) => {
      if (materials.has(original)) return materials.get(original)!;
      const material = original.clone();
      for (const [key, value] of Object.entries(material)) if (value instanceof Texture) {
        if (!textures.has(value)) textures.set(value, value.clone());
        (material as unknown as Record<string, unknown>)[key] = textures.get(value);
      }
      materials.set(original, material);
      return material;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(copy) : copy(mesh.material);
    mesh.castShadow = mesh.receiveShadow = true;
  });
  return clone;
}
