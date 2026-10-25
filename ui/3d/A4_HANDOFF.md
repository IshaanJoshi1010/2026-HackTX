# A3 and A4 handoff

The public interface remains frozen: `CarStage(props: CarStageProps): JSX.Element` and `preloadCars(vehicles: VehicleConfig[]): Promise<void>` from `@/ui/3d/CarStage`.

Surface samples are deterministic, area weighted MeshSurfaceSampler output from the optimized GLBs. Both cars have 32,768 high and 8,192 low points. The low file is the high file's stratified prefix. Normalization is 4.6 units along X, centered X/Z, ground Y=0. Camry samples include the viewer's PI orientation adjustment. Binary files are little-endian Float32 XYZ. Asset attribution in `public/models/manifest.json` and `CREDITS.txt` also applies to these derived samples.

`phase="reveal"` waits for assets, then emits converge at 0, pointcloud at 2, wireframe at 2.5, solid at 3 and done at 4 seconds. Particle motion is in the vertex shader. Skip flushes all remaining callbacks, including a skip received while loading. Reduced motion allocates no reveal particles. Replay disposes and recreates buffers. `viewMode="points"` renders the sampled surface. A missing point file keeps the solid viewer usable and reports a particle warning.

Paint values came from Paarth's synthetic listing snapshots: Camry Midnight Black Metallic #1B1B1B; RAV4 Silver Sky Metallic #A5A9AB. Both models remain representative. Canonical RAV4 ID is `rav4-2024-hybrid-xle`; its existing GLB filename is unchanged.

Created: `scripts/3d/sample-points.mjs`, `sample-points.test.mjs`, four `public/points/*.bin`, `ui/3d/usePointsFile.ts`, `ParticleReveal.tsx`, `__tests__/particles.test.ts`.

Internal exports: `samplePoints(input: string, flip?: boolean): Promise<Float32Array>`; `generate(root?: string): Promise<void>`; `usePointsFile(vehicleId: string, quality: "high" | "low")`; `loadPointsFile(url: string, quality: "high" | "low"): Promise<Float32Array>`; `createParticleReveal(target: Float32Array, low: boolean): Points`; `RevealClock.advance(delta: number): void`, `RevealClock.skip(): void`.

Validation: 19 viewer tests, 2 binary/reproducibility tests, TypeScript and scoped ESLint pass. Browser reveal completes all stages without errors and returns to Camry baseline 46 geometries / 8 textures. Ten replay resource-disposal cycles are tested without WebGL; the broader GPU audit is part of the next integration validation.

Commands from repo root:
```sh
node scripts/3d/sample-points.mjs
node --test scripts/3d/sample-points.test.mjs
npx vitest run ui/3d
npx tsc --noEmit
npx eslint ui/3d scripts/3d/stub-preview.tsx
```

Pending: A5 shader morph plus crossfade fallback, then A6 performance hardening.
