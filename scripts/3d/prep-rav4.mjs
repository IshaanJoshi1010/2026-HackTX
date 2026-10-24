// Source-specific preparation for the CC-BY 2021 RAV4 Adventure candidate.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, prune } from '@gltf-transform/functions';
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
// Permit collapsing CAD attribute seams while retaining source normals and UVs.
const seamSimplifier = { ...MeshoptSimplifier, simplify(indices, positions, stride, count, error, flags = []) {
  return MeshoptSimplifier.simplify(indices, positions, stride, count, error, [...flags, 'Permissive']);
}};
await doc.transform(prune(), weld(), simplify({simplifier:seamSimplifier, ratio:0.18, error:0.005}), prune());
await io.write(fileURLToPath(intermediate),doc);
console.log(await prepGlb(fileURLToPath(intermediate),fileURLToPath(output),'z'));
