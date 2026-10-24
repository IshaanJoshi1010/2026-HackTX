import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRDracoMeshCompression } from '@gltf-transform/extensions';
import draco from 'draco3dgltf';
import { MeshoptDecoder } from 'meshoptimizer';

// Static, Y-up vehicles only. Choose the source length axis explicitly.
export async function prepGlb(input, output, lengthAxis = 'z') {
  if (!['x', 'z'].includes(lengthAxis)) throw new Error('Length axis must be x or z.');
  if (resolve(input) === resolve(output)) throw new Error('Preserve the source: output must differ.');
  if ([input, output].some((path) => extname(path).toLowerCase() !== '.glb')) throw new Error('Expected GLB paths.');
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder': await draco.createDecoderModule(),
    'draco3d.encoder': await draco.createEncoderModule(),
    'meshopt.decoder': MeshoptDecoder,
  });
  const doc = await io.read(input);
  const root = doc.getRoot();
  if (root.listScenes().length !== 1 || root.listAnimations().length || root.listSkins().length) {
    throw new Error('Preparation requires one static, unskinned scene.');
  }
  const scene = root.listScenes()[0];
  scene.traverse((node) => {
    if (node.getExtension('EXT_mesh_gpu_instancing')) throw new Error('Instancing is unsupported.');
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      if (primitive.listTargets().length) throw new Error('Morph targets are unsupported.');
    }
  });
  const children = scene.listChildren();
  const rotation = doc.createNode('ForkSourceOrientation');
  if (lengthAxis === 'z') rotation.setRotation([0, Math.SQRT1_2, 0, Math.SQRT1_2]);
  for (const child of children) { scene.removeChild(child); rotation.addChild(child); }
  scene.addChild(rotation);
  const bounds = getBounds(scene);
  const length = bounds.max[0] - bounds.min[0];
  if (![...bounds.min, ...bounds.max].every(Number.isFinite) || length <= 0) throw new Error('Invalid vehicle bounds.');
  const scale = 4.6 / length;
  const normalized = doc.createNode('ForkNormalizedVehicle').setScale([scale, scale, scale])
    .setTranslation([-(bounds.min[0] + bounds.max[0]) * scale / 2,
      -bounds.min[1] * scale, -(bounds.min[2] + bounds.max[2]) * scale / 2]);
  scene.removeChild(rotation);
  normalized.addChild(rotation);
  scene.addChild(normalized);
  root.setDefaultScene(scene);
  root.listExtensionsUsed().filter((extension) => extension.extensionName === 'EXT_meshopt_compression')
    .forEach((extension) => extension.dispose());
  doc.createExtension(KHRDracoMeshCompression).setRequired(true).setEncoderOptions({
    method: KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER, encodeSpeed: 5, decodeSpeed: 5,
  });
  await io.write(output, doc);
  return { input: resolve(input), output: resolve(output), lengthAxis, scale, compression: 'KHR_draco_mesh_compression' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [input, output, axis = 'z'] = process.argv.slice(2);
  if (!input || !output) { console.error('Usage: node prep-glb.mjs <input.glb> <output.glb> [x|z]'); process.exitCode = 1; }
  else try { console.log(JSON.stringify(await prepGlb(input, output, axis), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
