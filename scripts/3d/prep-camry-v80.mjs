import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { fileURLToPath } from 'node:url';
import { prepGlb } from './prep-glb.mjs';
const path = (relative) => fileURLToPath(new URL(relative,import.meta.url));
const source=path('./source-assets/camry-v80/original.glb');
// Retain a full-detail normalized master for visual comparison.
await prepGlb(source,path('./source-assets/camry-v80/full-detail.glb'),'x');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc=await io.read(source);
await MeshoptSimplifier.ready;
await doc.transform(weld());
for(const mesh of doc.getRoot().listMeshes()) for(const primitive of mesh.listPrimitives()) {
  const indices=primitive.getIndices(), positions=primitive.getAttribute('POSITION'), normals=primitive.getAttribute('NORMAL');
  if(primitive.getMode()!==4 || !indices || !normals) continue;
  const target=Math.max(3,Math.floor(indices.getCount()*0.25/3)*3);
  const [reduced]=MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(indices.getArray()),
    new Float32Array(positions.getArray()),3,new Float32Array(normals.getArray()),3,[1,1,1],null,target,0.01);
  indices.setArray(reduced);
}
await doc.transform(weld(),prune());
const intermediate=path('./source-assets/camry-v80/simplified.glb');
await io.write(intermediate,doc);
console.log(await prepGlb(intermediate,path('../../public/models/camry-v80.glb'),'x'));
