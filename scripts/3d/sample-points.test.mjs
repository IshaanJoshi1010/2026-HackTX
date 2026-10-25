import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { samplePoints } from './sample-points.mjs';
const manifest = JSON.parse(await readFile('public/models/manifest.json', 'utf8'));
for (const entry of manifest) {
  test(`${entry.vehicleId}: counts, finite coordinates, normalized bounds, low prefix and reproducibility`, async () => {
    const highBytes = await readFile(`public${entry.points}`);
    const lowBytes = await readFile(`public${entry.points.replace('.bin', '-low.bin')}`);
    assert.equal(highBytes.length, 32768 * 12); assert.equal(lowBytes.length, 8192 * 12);
    assert.deepEqual(lowBytes, highBytes.subarray(0, lowBytes.length));
    for (const bytes of [highBytes, lowBytes]) {
      let min = Infinity, max = -Infinity;
      for (let i = 0; i < bytes.length; i += 4) {
        const value = bytes.readFloatLE(i); assert.ok(Number.isFinite(value));
        if (i % 12 === 0) { min = Math.min(min, value); max = Math.max(max, value); }
        if (i % 12 === 4) assert.ok(value >= -0.001);
      }
      assert.ok(Math.abs(max - min - 4.6) < 4.6 * 0.02);
    }
    const regenerated = await samplePoints(`public${entry.glb}`, entry.glb.includes('camry-v80'));
    for (let i = 0; i < regenerated.length; i++) assert.equal(regenerated[i], highBytes.readFloatLE(i * 4));
  });
}
