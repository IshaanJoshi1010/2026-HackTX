import { BufferAttribute, BufferGeometry, Material, Mesh, Object3D, StaticDrawUsage, Texture } from "three";

/** Independent GPU wrappers over immutable decoded data. Never edit these arrays.
 * Exotic, interleaved and dynamic attributes keep Three's defensive deep clone.
 */
export function cloneImmutableGeometry(source: BufferGeometry): BufferGeometry {
  const attributes = [...Object.values(source.attributes), ...Object.values(source.morphAttributes).flat(), ...(source.index ? [source.index] : [])];
  if ("isInstancedBufferGeometry" in source || source.indirect || attributes.some(attribute =>
    !(attribute instanceof BufferAttribute) || "isInstancedBufferAttribute" in attribute || "isFloat16BufferAttribute" in attribute || attribute.usage !== StaticDrawUsage)) return source.clone();
  const owned = new BufferGeometry();
  const wrappers = new Map<BufferAttribute, BufferAttribute>();
  const wrap = (attribute: BufferAttribute) => {
    let result = wrappers.get(attribute);
    if (!result) {
      result = new BufferAttribute(attribute.array, attribute.itemSize, attribute.normalized);
      result.name = attribute.name; result.usage = attribute.usage; result.gpuType = attribute.gpuType;
      wrappers.set(attribute, result);
    }
    return result;
  };
  owned.name = source.name;
  if (source.index) owned.setIndex(wrap(source.index));
  for (const [name, attribute] of Object.entries(source.attributes)) owned.setAttribute(name, wrap(attribute as BufferAttribute));
  for (const name of Object.keys(source.morphAttributes) as (keyof BufferGeometry["morphAttributes"])[]) {
    owned.morphAttributes[name] = source.morphAttributes[name]?.map(attribute => wrap(attribute as BufferAttribute));
  }
  owned.morphTargetsRelative = source.morphTargetsRelative;
  for (const group of source.groups) owned.addGroup(group.start, group.count, group.materialIndex);
  owned.boundingBox = source.boundingBox?.clone() ?? null;
  owned.boundingSphere = source.boundingSphere?.clone() ?? null;
  owned.setDrawRange(source.drawRange.start, source.drawRange.count);
  owned.userData = { ...source.userData };
  return owned;
}

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

/** Owned GPU resources; immutable decoded geometry arrays are shared with the CPU cache. */
export function cloneOwnedObject(source: Object3D): Object3D {
  const clone = source.clone(true);
  const geometries = new Map<BufferGeometry, BufferGeometry>();
  const materials = new Map<Material, Material>();
  const textures = new Map<Texture, Texture>();
  clone.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    if (!geometries.has(mesh.geometry)) geometries.set(mesh.geometry, cloneImmutableGeometry(mesh.geometry));
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
