// Local asset QA only. Serves the preview, Three.js package and prepared Camry.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const directory = fileURLToPath(new URL('.', import.meta.url));
const threeRoot = resolve(directory, 'node_modules/three');
const types = { '.html':'text/html', '.js':'text/javascript', '.wasm':'application/wasm', '.glb':'model/gltf-binary' };
createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let file;
    if (path === '/') file = resolve(directory, 'preview.html');
    else if (path === '/camry.glb') file = resolve(directory, '../../public/models/camry-2022-se.glb');
    else if (path === '/rav4.glb') file = resolve(directory, '../../public/models/rav4-hybrid-2024-xle.glb');
    else if (path === '/rav4-full.glb') file = resolve(directory, 'source-assets/rav4-2021/full-detail.glb');
    else if (path === '/camry-v80.glb') file = resolve(directory, '../../public/models/camry-v80.glb');
    else if (path === '/camry-v80-full.glb') file = resolve(directory, 'source-assets/camry-v80/full-detail.glb');
    else if (path.startsWith('/three/')) {
      file = resolve(threeRoot, path.slice(7));
      if (!file.startsWith(threeRoot + sep)) throw new Error('Invalid path');
    } else throw new Error('Unknown path');
    const bytes = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control':'no-store' });
    response.end(bytes);
  } catch { response.writeHead(404); response.end('Not found'); }
}).listen(4173, '127.0.0.1', () => console.log('Asset QA: http://127.0.0.1:4173'));
