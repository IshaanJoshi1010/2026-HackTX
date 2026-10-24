# D1-A2: real vehicle viewer

Status: A1/A2 checkpoint for review on `dev1-3d`. A3-A6 remain unfinished. Import `CarStage` and `preloadCars` from `@/ui/3d/CarStage`; the frozen props are unchanged. Give the parent a height and render from a Client Component.

## Behavior

The viewer loads the optimized manifest GLBs, makes independent GPU-resource copies, applies body paint, and crossfades without removing the old vehicle while the next loads. A failed request reports `onModelStatus` and keeps the prior model and its label. `preloadCars` awaits decoding and caches both source models. The source cache is CPU-only and bounded to four entries; rendered clones are disposed independently. Local Draco files and procedural lighting avoid a CDN requirement.

Paint uses an explicit hex in `vehicle.paint`, otherwise manifest `paintHex`, otherwise the original asset color. Named Toyota paint values are not guessed. Both current assets remain representative. Body material settings use the frozen 0.6 metalness / 0.28 roughness / 1 clearcoat / 0.05 clearcoat roughness. Graphite and red in the harness are illustrative.

Orbit, zoom, reset, solid and wireframe modes work. Points mode explicitly shows solid until A3. Reveal callbacks wait for actual loading but still use the A1-style timing placeholders; no particle reveal exists yet. Transition is currently a 1.8-second opacity crossfade, or 0.3 seconds with reduced motion; skip completes the fade. A5 will supply the particle morph. The model remains interactive after completion.

Implementation choices: direct GLTFLoader with an awaitable bounded cache instead of useGLTF's Suspense cache, to make preload completion and resource ownership explicit. The environment and contact-shadow targets are owned locally, rather than left in helper caches. The first browser audit found retained environment/transmission targets; explicit PMREM ownership and alpha-based lamp glass reduced the residual counters to the empty-studio baseline. No shared contract changes were made.

## Validation and limitations

- 16 Vitest tests: stub callbacks, real-viewer readiness/skip/error handling, resource ownership, paint, opacity restoration, stale loads, failed requests and crossfade cleanup.
- TypeScript, ESLint and Next production scaffold build pass. The component is exercised through the Vite harness; Ishaan still owns app-shell wiring.
- Browser: both real GLBs load; awaited preload resolves; orbit/zoom/reset, recoloring, wireframe, crossfade, low quality, reduced motion and missing-model reporting checked.
- Ten alternating mount/unmount cycles: Camry mounted 46 geometries / 8 textures; RAV4 mounted 39 / 9; every unmount returned to 0 / 3. An empty studio with no model loaded also returned to 0 / 3. These are renderer counters, not a measurement of total GPU bytes. No growth observed. Raw evidence: `scripts/3d/a2-memory-audit.json`.
- Steady-state render calls: Camry 89, RAV4 74. Reported rendered triangles include additional passes; unique asset triangles remain 179,412 and 165,419. Crossfades temporarily render both vehicles and may exceed the steady-state draw-call target. A6 profiling remains.
- The optimized RAV4 still has visible simplification artifacts under glossy lighting. Full-detail showroom models are not silently substituted into production, since they exceed the production triangle budget.
- No unexpected console errors in normal use. The deliberate missing-asset test produces an expected HTTP 404 and visible error message.

## Exports and files

Public API: `CarStage(props: CarStageProps): JSX.Element`, `CarStageStub(props: CarStageProps): JSX.Element`, `preloadCars(vehicles: VehicleConfig[]): Promise<void>`.

New viewer modules: `Scene.tsx`, `VehicleModel.tsx`, `VehicleController.ts`, `assets.ts`, `paint.ts`, `viewModes.ts`, `dispose.ts`, `StudioEnvironment.tsx`, `ContactShadows.tsx`, `diagnostics.tsx`, `__tests__/viewer.test.ts`, `__tests__/CarStage.test.tsx`. Added local decoder assets and Apache license under `public/models/draco`. Updated `CarStage.tsx`, the preview harness, and credits.

Internal helpers: `applyPaint(root: Object3D, bodyMaterialName: string, hex?: string): void`; `disposeObject(root: Object3D): void`; `cloneOwnedObject(source: Object3D): Object3D`. Dispose only owned clones, not shared cached source scenes.

Commands:

```sh
npx vitest run ui/3d/__tests__
npx next typegen && npx tsc --noEmit
npx eslint ui/3d scripts/3d/stub-preview.tsx
npm run build
node node_modules/vite/bin/vite.js --config scripts/3d/stub-vite.config.mts
```

Open `http://127.0.0.1:4174/scripts/3d/stub-preview.html`. The filename is retained from A1; it now renders the real viewer. Next milestone is A3 surface point sampling, then A4 reveal, A5 morph and A6 performance hardening.
