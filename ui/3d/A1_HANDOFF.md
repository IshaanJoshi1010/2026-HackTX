# D1-A1: CarStage integration stub

Historical A1 record. The current implementation has advanced to A2; see A2_HANDOFF.md. CarStageStub remains available separately. This is the grey-box integration milestone, not the completed 3D experience.

## Usage for Ishaan

1. In a Client Component, import `{ CarStage, preloadCars }` from `@/ui/3d/CarStage` and pass the frozen `CarStageProps` from `contracts/INTERFACES.md`.
2. Give the parent an explicit height. Start the signal counters at zero; increment them to reset, skip, or replay. Supply `transitionTo` for phase `transition`.
3. `CarStage` currently aliases `CarStageStub`; readiness and preload are mocked. The component renders a grey box, not the approved model. A2 will replace its internals without changing the props.

## Exports

- `CarStage(props: CarStageProps): JSX.Element`
- `CarStageStub(props: CarStageProps): JSX.Element`
- `preloadCars(vehicles: VehicleConfig[]): Promise<void>` (resolves immediately)
- `CarStageProps` type in `ui/3d/types.ts`, also re-exported from `CarStage.tsx`

The stub fires reveal stages at 0, 2000, 2500, 3000 and 4000 ms. Skip completes remaining callbacks immediately and once. Reduced motion completes without an animation delay. Replay restarts the timeline. Transition completes after 1800 ms and shows the target vehicle label. Timers are cancelled on unmount and phase changes. Inline parent callback changes do not restart a run. Solid, wireframe and points modes render the box differently. Orbit and reset use the frozen camera settings; pixel ratio caps at 2 or 1 for low quality.

Readiness means the placeholder is ready, not that a GLB has been downloaded. No particles, production model loading, morph, crossfade or GPU leak audit is implemented yet. A2-A6 remain.

## Validation

- `npx vitest run ui/3d/__tests__/CarStageStub.test.tsx`: eight tests pass.
- `npx next typegen && npx tsc --noEmit`: pass. Generate Next route types before typechecking a fresh checkout.
- ESLint on new A1 source, tests and preview harness: pass.
- `npm run build`: pass for the current scaffold. The stub is browser-checked via the isolated harness; it has not been wired into the app.
- Browser: WebGL grey box and points rendering, reveal event order, target RAV4 label and transition callback verified without console errors.

Run the isolated harness: `node node_modules/vite/bin/vite.js --config scripts/3d/stub-vite.config.mts`, then open `http://127.0.0.1:4174/scripts/3d/stub-preview.html`.

## Files added

`ui/3d/CarStage.tsx`, `CarStageStub.tsx`, `types.ts`, `useStubTimeline.ts`, `__tests__/CarStageStub.test.tsx`, this handoff; `scripts/3d/stub-preview.html`, `stub-preview.tsx`, `stub-vite.config.mts`.

Integration exception: imported Dev 3's existing `contracts/index.ts` unchanged and updated root `package.json` / `package-lock.json` with the 3D dependencies. Shared contract ownership stays with Dev 3/4. Existing asset files and showroom previews are preserved.
