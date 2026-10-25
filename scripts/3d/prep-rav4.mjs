// Source-specific preparation for the CC-BY 2021 RAV4 Adventure candidate.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { prepGlb } from './prep-glb.mjs';

const source = new URL('./source-assets/rav4-2021/original.glb', import.meta.url);
const intermediate = new URL('./source-assets/rav4-2021/simplified.glb', import.meta.url);
const output = new URL('../../public/models/rav4-hybrid-2024-xle.glb', import.meta.url);
const { fileURLToPath } = await import('node:url');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(fileURLToPath(source));
// The Collada export includes redundant CAD edge lines. Retain surface meshes.
for (const mesh of doc.getRoot().listMeshes()) {
  for (const primitive of mesh.listPrimitives()) if (primitive.getMode() === 1) { mesh.removePrimitive(primitive); primitive.dispose(); }
}
await MeshoptSimplifier.ready;
await doc.transform(prune(), weld());
// Include normal error in simplification: position-only seam collapse leaves
// visibly broken highlights across glossy body panels. Preserve window surfaces.
for (const mesh of doc.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
  const indices = primitive.getIndices(), positions = primitive.getAttribute('POSITION'), normals = primitive.getAttribute('NORMAL');
  const name = primitive.getMaterial()?.getName() ?? '';
  if (primitive.getMode() !== 4 || !indices || !normals || /Windows(?:Trims)?$/i.test(name)) continue;
  const ratio = /Adventure_Rock|WhiteRoof|Rims|BlackTrims/.test(name) ? 0.3 : 0.08;
  const target = Math.max(3, Math.floor(indices.getCount() * ratio / 3) * 3);
  const [reduced] = MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(indices.getArray()),
    new Float32Array(positions.getArray()), 3, new Float32Array(normals.getArray()), 3,
    [0.25, 0.25, 0.25], null, target, 0.015, ['Permissive']);
  indices.setArray(reduced);
}
await doc.transform(weld(), prune());
await io.write(fileURLToPath(intermediate),doc);
console.log(await prepGlb(fileURLToPath(intermediate),fileURLToPath(output),'z'));
