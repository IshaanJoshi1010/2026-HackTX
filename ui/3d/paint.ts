import { Mesh, MeshPhysicalMaterial, Object3D, type Material } from "three";

export function isPaintHex(value: string | undefined): value is string {
  return !!value && /^#[0-9a-f]{6}$/i.test(value);
}

/** Replace only the named body material, or the first body-like fallback. */
export function applyPaint(root: Object3D, bodyMaterialName: string, hex?: string): void {
  const all = new Set<Material>();
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (mesh.isMesh) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) => all.add(material));
  });
  const target = [...all].find((material) => material.name === bodyMaterialName)
    ?? [...all].find((material) => /body|paint|carpaint|exterior/i.test(material.name));
  if (!target) return;
  const source = target as MeshPhysicalMaterial;
  const paint = new MeshPhysicalMaterial({ name: target.name, color: source.color,
    metalness: 0.6, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.05,
    map: source.map, normalMap: source.normalMap,
    side: target.side, opacity: target.opacity, transparent: target.transparent,
  });
  if (isPaintHex(hex)) paint.color.set(hex);
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((material) => material === target ? paint : material)
      : mesh.material === target ? paint : mesh.material;
  });
  target.dispose();
}
