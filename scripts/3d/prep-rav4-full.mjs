import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import { prepGlb } from './prep-glb.mjs';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const dir=new URL('./source-assets/rav4-2021/',import.meta.url);
const {fileURLToPath}=await import('node:url');
const doc=await io.read(fileURLToPath(new URL('original.glb',dir)));
for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives())if(p.getMode()===1){mesh.removePrimitive(p);p.dispose();}
await doc.transform(prune());
await io.write(fileURLToPath(new URL('surfaces.glb',dir)),doc);
console.log(await prepGlb(fileURLToPath(new URL('surfaces.glb',dir)),fileURLToPath(new URL('full-detail.glb',dir)),'z'));
