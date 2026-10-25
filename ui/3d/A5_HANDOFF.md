# A5 integration handoff

Status: A0-A5 implemented on `dev1-3d`. A3/A4 checkpoint is `94b02fc`. A6 projector/performance profiling and the final integrated rehearsal remain.

## Public interface

Import from `@/ui/3d/CarStage`:
```ts
CarStage(props: CarStageProps): JSX.Element
preloadCars(vehicles: VehicleConfig[]): Promise<void>
```
Props remain frozen. Supply a height and use a Client Component. `preloadCars` loads both GLBs and both point tiers. On `onTransitionComplete`, adopt `transitionTo` as `vehicle` and set `phase="interactive"`. The existing destination instance is retained through that handoff, avoiding a second crossfade/allocation. While the parent updates, the destination remains visible.

## Behavior

- Reveal: converge 0-2s, point cloud 2-2.5s, wireframe 2.5-3s, solid 3-4s. Resources load before the clock starts. Skip emits remaining stages in order. Reduced motion goes straight to solid.
- Morph: 0.3s solid to particles, 1.2s interpolation, 0.3s destination solid. Shared world-space Morton ordering pairs points. All particle motion occurs in the vertex shader; CPU updates uniforms only. Body paint and particle tint interpolate.
- Orbit controls pause only during the particle morph and resume on completion or skip. Camera is unchanged. Other app controls remain available.
- `forceFallback` in `ParticleMorph.tsx` is **false**. Set it to **true** for the one-second scan-line crossfade. Missing/incompatible point files automatically use that fallback. Reduced-motion transitions use a 0.3s crossfade. The fallback was enabled temporarily for browser verification, then reset to false.
- Both tiers use equal counts per car: 32,768 high / 8,192 low. Samples and GLBs share 4.6-unit X length, X/Z centering and Y=0 grounding, including the Camry front-direction correction. Static points mode is cyan.
- Temporary morph/reveal/scan resources are disposed on completion, replacement and unmount. Point-view geometry is disposed when leaving that mode. Source CPU caches are bounded; rendered resources are owned copies.
- A failed GLB preserves the previous vehicle. A failed or timed-out point fetch keeps the solid preview usable and reports a particle warning.
- Paint is populated from Paarth's synthetic listing handoff: Camry Midnight Black Metallic #1B1B1B, RAV4 Silver Sky Metallic #A5A9AB. Both assets remain representative. Canonical RAV4 ID is `rav4-2024-hybrid-xle`.

## Validation

- Full repository suite: **639 tests across 51 files pass**, including the final transition-handoff regression.
- TypeScript, scoped ESLint and Next production build pass.
- Binary tests check both counts, finite values, normalized bounds, low prefix, and regeneration reproducibility. Existing model preparation/asset gates also pass.
- Browser: reveal stages, both point silhouettes, low tier, reduced-motion instant reveal, low-tier morph skip, full morph and forced fallback checked. No shader errors.
- Ten RAV4 reveals return to **39 geometries / 9 textures** each time: `scripts/3d/a4-gpu-replays.json`.
- Ten alternating morphs return to **39 / 9** for RAV4 and **46 / 8** for Camry: `scripts/3d/a5-gpu-morphs.json`. No counter growth. These are renderer counters, not total GPU bytes.
- Ten alternating mount/unmount cycles return to **0 geometries / 3 renderer-owned textures** after every unmount, matching the prior empty-studio baseline: `scripts/3d/a5-gpu-unmounts.json`.
- Steady-state calls remain Camry 89 / RAV4 74. Transitional overlap can exceed the steady-state target. Broader FPS/projector-resolution testing belongs to A6.

## Files and internal exports

A3/A4 created `sample-points.mjs`, `sample-points.test.mjs`, four point binaries, `usePointsFile.ts`, `ParticleReveal.tsx`, particle tests and `A4_HANDOFF.md`.

A5 creates `ParticleMorph.tsx`, `__tests__/morph.test.ts`, `__tests__/VehicleModel.test.tsx`, this handoff, `public/points/CREDITS.txt`, and GPU audit JSON files. Updates are limited to Dev 1 folders plus Kareem's row in `docs/HANDOFF.md`.

Internal exports:
```ts
mortonSort(points: Float32Array): Float32Array
createParticleMorph(from: Float32Array, to: Float32Array, low: boolean): Points
createScanLine(): { geometry: BufferGeometry; material: ShaderMaterial }
forceFallback: boolean
usePointsFile(vehicleId: string, quality: "high" | "low")
loadPointsFile(url: string, quality: "high" | "low"): Promise<Float32Array>
```

Run from repo root:
```sh
npm test
npx tsc --noEmit
npx eslint ui/3d scripts/3d/stub-preview.tsx
node --test scripts/3d/inspect-glb.test.mjs scripts/3d/prep-glb.test.mjs scripts/3d/assets.test.mjs scripts/3d/sample-points.test.mjs
npm run build
```
Preview: `node node_modules/vite/bin/vite.js --config scripts/3d/stub-vite.config.mts`, then `/scripts/3d/stub-preview.html` on port 4174. The preview has ten-reveal, ten-morph and mount/unmount audit buttons.
